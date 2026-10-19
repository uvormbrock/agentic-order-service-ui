import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerDialog } from '../features/customers/CustomerDialog';
import { OrdersView } from '../features/orders/OrdersView';
import { ProductThumbnail } from '../features/products/ProductThumbnail';
import { ProductsView } from '../features/products/ProductsView';
import { CustomerShopping } from '../features/shopping/CustomerShopping';

const customer = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alice', email: 'alice@example.invalid', active: true };
const other = { ...customer, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Other' };
const product = { id: '11111111-2222-3333-4444-555555555555', name: 'Keyboard', price: 50, active: true };
const secondId = '22222222-2222-3333-4444-555555555555';
const order = { id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: other.id, customer: other, items: [{ productId: product.id, productName: 'Keyboard', quantity: 1, unitPrice: 50, lineTotal: 50 }], subtotal: 50, discount: 0, total: 50, currency: 'EUR' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function reads(path: string) {
  if (path === '/customers') return json([customer]);
  if (path === '/products') return json([product]);
  if (path === '/orders') return json([]);
  return json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404);
}
const postCalls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
async function settle() { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); }
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('audit hardening', () => {
  it.each(['admin', 'shopping'] as const)('does not replay uncertain network/500 %s checkout after timers, rerenders or read refreshes', async mode => {
    // Exercise both transport and HTTP failures independently through each real form.
    for (const failure of ['network', '500']) {
      let historyReads = 0;
      const fetch = vi.fn(async (path: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          if (failure === 'network') throw new TypeError('offline');
          return json({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' }, 500);
        }
        if (path === '/orders') historyReads++;
        return reads(path);
      });
      vi.stubGlobal('fetch', fetch);
      const component = mode === 'admin' ? <OrdersView /> : <CustomerShopping onPending={vi.fn()} />;
      const view = render(<MantineProvider>{component}</MantineProvider>);
      if (mode === 'admin') {
        await screen.findByText('No orders yet');
        fireEvent.click(screen.getByRole('button', { name: 'New order' }));
        await waitFor(() => expect(screen.getByLabelText('Customer')).toBeEnabled());
        fireEvent.change(screen.getByLabelText('Customer'), { target: { value: customer.id } });
        fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: product.id } });
      } else {
        await waitFor(() => expect(screen.getByLabelText('Shopping customer')).toBeEnabled());
        fireEvent.change(screen.getByLabelText('Shopping customer'), { target: { value: customer.id } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' }));
        fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
      }
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: mode === 'admin' ? 'Create order' : 'Confirm order' }));
      await settle();
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('The outcome is uncertain');
      for (const interval of [60_000, 300_000]) {
        await act(async () => { await vi.advanceTimersByTimeAsync(interval); });
        view.rerender(<MantineProvider>{mode === 'admin' ? <OrdersView /> : <CustomerShopping onPending={vi.fn()} />}</MantineProvider>);
        await settle();
        expect(postCalls(fetch)).toHaveLength(1);
      }
      if (mode === 'admin') {
        fireEvent.click(screen.getByRole('button', { name: 'Reload choices' }));
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh My Orders' }));
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh shopping choices' }));
      }
      await settle();
      await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
      expect(historyReads).toBeGreaterThanOrEqual(2);
      expect(postCalls(fetch)).toHaveLength(1);
      expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument();
      if (mode === 'admin') expect(screen.getByLabelText('Quantity 1')).toHaveValue('1');
      else expect(screen.getByLabelText('Quantity for Keyboard')).toHaveValue('1');
      view.unmount(); vi.useRealTimers();
    }
  });

  it('rejects otherwise complete201 confirmation for a different customer without clearing cart or showing a receipt', async () => {
    const fetch = vi.fn(async (path: string, options?: RequestInit) => options?.method === 'POST' ? json(order, 201) : reads(path));
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><CustomerShopping onPending={vi.fn()} /></MantineProvider>);
    await waitFor(() => expect(screen.getByLabelText('Shopping customer')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Shopping customer'), { target: { value: customer.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));
    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('unusable order confirmation');
    expect(alert).toHaveTextContent('The outcome is uncertain');
    expect(screen.getByLabelText('Quantity for Keyboard')).toHaveValue('1');
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText(`Order ${order.id}`)).not.toBeInTheDocument();
    expect(postCalls(fetch)).toHaveLength(1);
  });

  it.each(['deactivate', 'delete'] as const)('guards pending customer %s against duplicate confirmation and modal dismissal', async kind => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch);
    const close = vi.fn(), saved = vi.fn(), deleted = vi.fn();
    render(<MantineProvider><CustomerDialog action={{ kind, customer }} onClose={close} onSaved={saved} onDeleted={deleted} /></MantineProvider>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('button.mantine-Modal-close')).not.toBeNull();
    const confirm = screen.getByRole('button', { name: kind === 'delete' ? 'Confirm deletion' : 'Confirm deactivation' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/customers/${customer.id}`, expect.objectContaining({ method: kind === 'delete' ? 'DELETE' : 'PATCH', ...(kind === 'deactivate' ? { body: '{"active":false}' } : {}) }));
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    const overlay = document.querySelector('.mantine-Modal-overlay')!;
    fireEvent.mouseDown(overlay); fireEvent.mouseUp(overlay); fireEvent.click(overlay);
    expect(dialog.querySelector('button.mantine-Modal-close')).toBeNull();
    expect(close).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled(); expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () => { resolve(kind === 'delete' ? new Response(null, { status: 204 }) : json({ ...customer, active: false })); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(kind === 'delete' ? deleted : saved).toHaveBeenCalledTimes(1);
    expect(kind === 'delete' ? saved : deleted).not.toHaveBeenCalled();
  });

  it('fully edits an inactive product from prepopulation through PUT, modal closure and authoritative GET refresh', async () => {
    const initial = { ...product, active: false };
    const updated = { ...initial, name: 'Updated Keyboard', price: 37.25 };
    const refreshed = { ...updated, name: 'Refreshed Keyboard', price: 38.50 };
    let resolveRefresh!: (response: Response) => void;
    let productReads = 0;
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (options?.method === 'PUT') return json(updated);
      if (path === '/products') {
        productReads++;
        return productReads === 1 ? json([initial]) : new Promise<Response>(done => { resolveRefresh = done; });
      }
      return reads(path);
    });
    vi.stubGlobal('fetch', fetch); render(<MantineProvider><ProductsView /></MantineProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Keyboard' }));
    expect(screen.getByLabelText('Product name')).toHaveValue('Keyboard');
    expect(screen.getByLabelText('Price (EUR)')).toHaveValue('50.00');
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: ' Updated Keyboard ' } });
    fireEvent.change(screen.getByLabelText('Price (EUR)'), { target: { value: '37.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(productReads).toBe(2));
    expect(fetch).toHaveBeenCalledWith(`/products/${product.id}`, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Updated Keyboard', price: 37.25 }) }));
    expect(screen.getByRole('heading', { name: 'Updated Keyboard' })).toBeVisible();
    expect(screen.getByText('€37.25')).toBeVisible();
    await act(async () => { resolveRefresh(json([refreshed])); });
    expect(screen.getByRole('heading', { name: 'Refreshed Keyboard' })).toBeVisible();
    expect(screen.getByText('€38.50')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Updated Keyboard' })).not.toBeInTheDocument();
    expect(screen.getByText('Inactive', { exact: true })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Deactivate Refreshed Keyboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Product saved successfully');
  });

  it.each(['id', 'revision'] as const)('ignores stale pending thumbnail %s responses and revokes only active object URLs', async change => {
    const resolvers: Array<(response: Response) => void> = [];
    const fetch = vi.fn((_path: string, _options?: RequestInit) => new Promise<Response>(done => { resolvers.push(done); }));
    vi.stubGlobal('fetch', fetch);
    let number = 0;
    const create = vi.fn((_blob: Blob) => `blob:audit-${++number}`), revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const image = (id: string, revision: number) => <MantineProvider><ProductThumbnail id={id} name="Keyboard" revision={revision} /></MantineProvider>;
    const view = render(image(product.id, 0));
    const png = () => new Response(new Blob(['png'], { type: 'image/png' }));
    await act(async () => { resolvers[0]!(png()); });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:audit-1');
    view.rerender(image(product.id, 1));
    expect(revoke).toHaveBeenCalledWith('blob:audit-1');
    view.rerender(image(change === 'id' ? secondId : product.id, change === 'id' ? 1 : 2));
    expect(fetch.mock.calls[2]?.[0]).toBe(`/products/${change === 'id' ? secondId : product.id}/image/thumbnail`);
    expect(fetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => { resolvers[2]!(png()); });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:audit-2');
    await act(async () => { resolvers[1]!(png()); });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:audit-2');
    expect(create).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(revoke.mock.calls).toEqual([['blob:audit-1'], ['blob:audit-2']]);
  });
});
