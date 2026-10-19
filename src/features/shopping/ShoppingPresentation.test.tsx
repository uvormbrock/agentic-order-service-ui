import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { MyOrders } from './MyOrders';

const customer = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alice', email: 'alice@example.invalid', active: true };
const firstId = '11111111-2222-3333-4444-555555555555', secondId = '22222222-2222-3333-4444-555555555555';
const product = { id: firstId, name: 'Catalog Keyboard', price: 99, active: true };
const order = { id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: customer.id, customer, items: [{ productId: firstId, productName: 'Historical Keyboard', unitPrice: 40, quantity: 1, lineTotal: 40 }, { productId: secondId, productName: 'Historical Mouse', unitPrice: 20, quantity: 2, lineTotal: 40 }], subtotal: 80, discount: 8, total: 72, currency: 'EUR' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const missing = () => json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404);
function urls() {
  let next = 0;
  const create = vi.fn((_blob: Blob) => `blob:shopping-${++next}`), revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  return { create, revoke };
}

describe('shopping presentation', () => {
  it('changes blue active/neutral inactive modes immediately, preserves pending locks and shows confirmed receipt thumbnail', async () => {
    urls(); let resolve!: (response: Response) => void;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done; });
      if (path === '/products') return Promise.resolve(json([product]));
      if (path === '/customers') return Promise.resolve(json([customer]));
      if (path === '/orders') return Promise.resolve(json([]));
      return Promise.resolve(new Response(new Blob(['png'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    });
    vi.stubGlobal('fetch', fetch); render(<MantineProvider><App /></MantineProvider>);
    const admin = screen.getByRole('button', { name: 'Admin' }), buyer = screen.getByRole('button', { name: 'Customer' });
    expect(admin).toHaveAttribute('data-variant', 'filled'); expect(admin).toHaveAttribute('aria-pressed', 'true');
    expect(admin.style.getPropertyValue('--button-bg')).toBe('var(--mantine-color-blue-filled)');
    expect(buyer).toHaveAttribute('data-variant', 'default'); expect(buyer).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(buyer);
    expect(buyer).toHaveAttribute('data-variant', 'filled'); expect(buyer).toHaveAttribute('aria-pressed', 'true');
    expect(buyer.style.getPropertyValue('--button-bg')).toBe('var(--mantine-color-blue-filled)');
    expect(admin).toHaveAttribute('data-variant', 'default'); expect(admin).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(screen.getByLabelText('Shopping customer')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Shopping customer'), { target: { value: customer.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Catalog Keyboard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));
    expect(admin).toBeDisabled(); expect(buyer).toBeDisabled();
    fireEvent.click(admin); expect(buyer).toHaveAttribute('aria-pressed', 'true');
    const receipt = { ...order, items: [order.items[0]!], subtotal: 40, discount: 4, total: 36 };
    await act(async () => { resolve(json(receipt, 201)); });
    expect(await screen.findByText('Order confirmed')).toBeVisible();
    expect(await screen.findByRole('img', { name: 'Historical Keyboard thumbnail' })).toBeVisible();
    expect(screen.getByText('Total: €36.00')).toBeVisible();
    expect(screen.getByText('Unit price: €40.00 · Quantity: 1 · Line total: €40.00')).toBeVisible();
    expect(screen.getByText(/Thumbnails show current product images/)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(`/products/${firstId}/image/thumbnail`, expect.objectContaining({ headers: { Accept: 'image/png' } }));
    expect(admin).toBeEnabled(); fireEvent.click(admin);
    expect(admin).toHaveAttribute('data-variant', 'filled'); expect(buyer).toHaveAttribute('data-variant', 'default');
  });

  it('associates My Orders PNG thumbnails with two historical IDs, preserves historical amounts and cleans blob URLs', async () => {
    const { create, revoke } = urls();
    const fetch = vi.fn(async (path: string) => path === '/orders' ? json([order]) : new Response(path, { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    const view = render(<MantineProvider><MyOrders customerId={customer.id} revision={0} /></MantineProvider>);
    expect(await screen.findByRole('img', { name: 'Historical Keyboard thumbnail' })).toHaveAttribute('src', 'blob:shopping-1');
    expect(await screen.findByRole('img', { name: 'Historical Mouse thumbnail' })).toHaveAttribute('src', 'blob:shopping-2');
    expect(await create.mock.calls[0]![0].text()).toBe(`/products/${firstId}/image/thumbnail`);
    expect(await create.mock.calls[1]![0].text()).toBe(`/products/${secondId}/image/thumbnail`);
    expect(create.mock.calls.map(([blob]) => blob.type)).toEqual(['image/png', 'image/png']);
    expect(screen.getByText('Unit price: €20.00 · Quantity: 2 · Line total: €40.00')).toBeVisible();
    expect(screen.getByText('Subtotal: €80.00')).toBeVisible(); expect(screen.getByText('Discount: €8.00')).toBeVisible(); expect(screen.getByText('Total: €72.00')).toBeVisible();
    expect(fetch).not.toHaveBeenCalledWith('/products', expect.anything());
    view.unmount(); expect(revoke.mock.calls).toEqual([['blob:shopping-1'], ['blob:shopping-2']]);
  });

  it.each(['missing', 'network'])('isolates My Orders %s thumbnails from history and money', async failure => {
    const fetch = vi.fn(async (path: string) => {
      if (path === '/orders') return json([order]);
      if (failure === 'network') throw new TypeError('offline');
      return missing();
    });
    vi.stubGlobal('fetch', fetch); render(<MantineProvider><MyOrders customerId={customer.id} revision={0} /></MantineProvider>);
    expect(await screen.findAllByText(failure === 'missing' ? 'No image' : 'Image unavailable')).toHaveLength(2);
    for (const text of ['Historical Keyboard', 'Historical Mouse', 'Subtotal: €80.00', 'Discount: €8.00', 'Total: €72.00']) expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
