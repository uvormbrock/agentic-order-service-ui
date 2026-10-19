import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { CustomerShopping } from './CustomerShopping';
import { MyOrders } from './MyOrders';

const alice = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alice', email: 'alice@example.invalid', active: true };
const bob = { ...alice, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Bob', email: 'bob@example.invalid' };
const keyboard = { id: '11111111-2222-3333-4444-555555555555', name: 'Keyboard', price: 50, active: true };
const mouse = { ...keyboard, id: '22222222-2222-3333-4444-555555555555', name: 'Mouse', price: 25 };
const order = { id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: alice.id, customer: alice, items: [{ productId: keyboard.id, productName: 'Server Keyboard', quantity: 2, unitPrice: 40, lineTotal: 80 }, { productId: mouse.id, productName: 'Server Mouse', quantity: 1, unitPrice: 20, lineTotal: 20 }], subtotal: 100, discount: 10, total: 90, currency: 'EUR' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'shop-123' } });
const missing = () => json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404);
function reads(path: string) {
  if (path === '/customers') return json([alice, bob, { ...alice, id: 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Inactive Customer', active: false }]);
  if (path === '/products') return json([keyboard, mouse, { ...keyboard, id: '33333333-2222-3333-4444-555555555555', name: 'Inactive Product', active: false }]);
  if (path === '/orders') return json([]);
  return missing();
}
const show = () => render(<MantineProvider><CustomerShopping onPending={vi.fn()} /></MantineProvider>);
async function selectCustomer(id = alice.id) {
  await waitFor(() => expect(screen.getByLabelText('Shopping customer')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Shopping customer'), { target: { value: id } });
}
async function addKeyboard() { await selectCustomer(); fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' })); }
const writes = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(([, options]) => options?.method === 'POST');

describe('customer shopping', () => {
  it('shows active choices, missing thumbnail fallback and local-demo/privacy warning; blocks checkout without a customer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => reads(path))); show();
    await screen.findByRole('button', { name: 'Add Keyboard to cart' });
    expect(screen.getByText(/Selecting a customer does not verify identity/)).toBeVisible();
    expect(screen.queryByText('Inactive Product')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Inactive Customer/ })).not.toBeInTheDocument();
    expect(await screen.findAllByText('No image')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Keyboard to cart' })).toBeDisabled();
    await selectCustomer();
    expect(await screen.findByText(/full order list is fetched and filtered locally/)).toBeVisible();
  });

  it('merges repeated additions, supports multiple products, validates quantities and removes lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => reads(path))); show(); await addKeyboard();
    fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Mouse to cart' }));
    expect(screen.getAllByLabelText('Quantity for Keyboard')).toHaveLength(1);
    expect(screen.getByLabelText('Quantity for Keyboard')).toHaveValue('2');
    expect(screen.getByText('Estimated subtotal: €125.00')).toBeVisible();
    for (const quantity of ['0', '10001', '1.5', '1e2', '']) {
      fireEvent.change(screen.getByLabelText('Quantity for Keyboard'), { target: { value: quantity } });
      expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    }
    for (const quantity of ['1', '10000']) {
      fireEvent.change(screen.getByLabelText('Quantity for Keyboard'), { target: { value: quantity } });
      expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mouse' }));
    expect(screen.queryByLabelText('Quantity for Mouse')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Keyboard' }));
    expect(screen.getByText('Your cart is empty.')).toBeVisible();
  });

  it('requires explicit confirmation, locks mode/customer/cart during one exact POST, clears cart after201 and separates receipt from history failure', async () => {
    let resolve!: (response: Response) => void; let history = 0;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done; });
      if (path === '/orders') return Promise.resolve(++history === 1 ? json([]) : json({ code: 'SERVICE_UNAVAILABLE', message: 'History unavailable.' }, 503));
      return Promise.resolve(reads(path));
    });
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><App /></MantineProvider>);
    await screen.findByRole('heading', { name: 'Keyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    await addKeyboard(); fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' })); fireEvent.click(screen.getByRole('button', { name: 'Add Mouse to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    expect(writes(fetch)).toHaveLength(0);
    const confirm = screen.getByRole('button', { name: 'Confirm order' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Admin' })).toBeDisabled();
    expect(screen.getByLabelText('Shopping customer')).toBeDisabled();
    expect(screen.getByLabelText('Quantity for Keyboard')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Keyboard' })).toBeDisabled();
    expect(writes(fetch)).toHaveLength(1);
    expect(writes(fetch)[0]).toEqual(['/orders', expect.objectContaining({ method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: alice.id, items: [{ productId: keyboard.id, quantity: 2 }, { productId: mouse.id, quantity: 1 }] }) })]);
    resolve(json(order, 201));
    expect(await screen.findByText('Order confirmed')).toBeVisible();
    expect(screen.getByText('Your cart is empty.')).toBeVisible();
    expect(screen.getByText('Subtotal: €100.00')).toBeVisible();
    expect(screen.getByText('Discount: €10.00')).toBeVisible();
    expect(screen.getByText('Total: €90.00')).toBeVisible();
    expect(await screen.findByText('My Orders refresh failed')).toBeVisible();
    expect(screen.getByText(/confirmed order remains successful/)).toBeVisible();
    await selectCustomer(bob.id);
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText(`Order ${order.id}`)).not.toBeInTheDocument();
    expect(screen.getByText('Your cart is empty.')).toBeVisible();
  });

  it.each(['network', '500', 'unexpected200', 'decode', 'unusable', 'inactive', 'missing'] as const)('retains draft on %s without automatic POST replay', async failure => {
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (!options?.method) return reads(path);
      if (failure === 'network') throw new TypeError('offline');
      if (failure === '500') return json({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' }, 500);
      if (failure === 'inactive') return json({ code: 'PRODUCT_INACTIVE', message: 'The product is inactive.' }, 409);
      if (failure === 'missing') return json({ code: 'PRODUCT_NOT_FOUND', message: 'The product was not found.' }, 404);
      if (failure === 'decode') return new Response('invalid JSON', { status: 201 });
      if (failure === 'unusable') return json({ id: order.id }, 201);
      return json(order, 200);
    });
    vi.stubGlobal('fetch', fetch); show(); await addKeyboard();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));
    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent(['inactive', 'missing'].includes(failure) ? failure === 'inactive' ? 'PRODUCT_INACTIVE' : 'PRODUCT_NOT_FOUND' : 'The outcome is uncertain');
    expect(screen.getByLabelText('Quantity for Keyboard')).toHaveValue('1');
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument();
    expect(writes(fetch)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await selectCustomer(bob.id);
    expect(screen.getByText('Your cart is empty.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears confirmation and cart immediately when selected customer changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => reads(path))); show(); await addKeyboard();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirm checkout');
    await selectCustomer(bob.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Your cart is empty.')).toBeVisible();
  });

  it('filters My Orders by exact customerId and ignores old identity responses after switching', async () => {
    let oldResolve!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { oldResolve = done; })).mockResolvedValueOnce(json([{ ...order, customerId: bob.id, customer: bob }, order]));
    vi.stubGlobal('fetch', fetch);
    const view = render(<MantineProvider><MyOrders customerId={alice.id} revision={0} /></MantineProvider>);
    view.rerender(<MantineProvider><MyOrders customerId={bob.id} revision={0} /></MantineProvider>);
    expect(await screen.findByText('Customer: Bob')).toBeVisible();
    expect(screen.queryByText('Customer: Alice')).not.toBeInTheDocument();
    await act(async () => { oldResolve(json([order])); });
    await waitFor(() => expect(screen.queryByText('Customer: Alice')).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/orders', expect.objectContaining({ headers: { Accept: 'application/json' } }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves admin navigation and shopping cart across mode switches', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => reads(path)));
    render(<MantineProvider><App /></MantineProvider>);
    await screen.findByRole('heading', { name: 'Keyboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
    await screen.findByRole('heading', { name: 'Alice' });
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    expect(screen.queryByRole('navigation', { name: 'Administration views', hidden: true })).not.toBeInTheDocument();
    await addKeyboard();
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    expect(screen.getByRole('navigation', { name: 'Administration views' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add customer' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    expect(screen.getByLabelText('Quantity for Keyboard')).toHaveValue('1');
  });
});
