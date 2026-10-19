import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../../api/openapi.json';
import { App } from '../../app/App';
import { OrdersView } from './OrdersView';
import { NewOrderDialog, validateOrderDraft } from './NewOrderDialog';
import { OrderDetailsDialog } from './OrderDetailsDialog';

const customer = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Current Customer', email: 'current@example.invalid', active: true };
const first = { id: '11111111-2222-3333-4444-555555555555', name: 'Current Catalog Name', price: 999, active: true };
const second = { ...first, id: '22222222-2222-3333-4444-555555555555', name: 'Second Product' };
const order = { id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: customer.id, customer, items: [{ productId: first.id, productName: 'Historical Name', quantity: 3, unitPrice: 7, lineTotal: 21 }], subtotal: 21, discount: 4, total: 17, currency: 'USD' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'order-123' } });
const show = () => render(<MantineProvider><OrdersView /></MantineProvider>);
const dialog = () => render(<MantineProvider><NewOrderDialog onClose={vi.fn()} onSaved={vi.fn()} /></MantineProvider>);
const choices = (path: string) => json(path === '/customers' ? [customer, { ...customer, id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Inactive Customer', active: false }] : [first, second, { ...first, id: '33333333-2222-3333-4444-555555555555', name: 'Inactive Product', active: false }]);
async function selectFirst() {
  await waitFor(() => expect(screen.getByLabelText('Customer')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Customer'), { target: { value: customer.id } });
  fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: first.id } });
}

describe('order integration', () => {
  it('loads list, shows initial error and retry loading before empty response', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch); show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading orders');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server');
    expect(screen.getByRole('alert')).not.toHaveTextContent('BACKEND_URL');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading orders');
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument();
    resolve(json([])); expect(await screen.findByText('No orders yet')).toBeVisible();
    expect(fetch).toHaveBeenCalledWith('/orders', expect.objectContaining({ headers: { Accept: 'application/json' } }));
  });

  it('renders server list totals/currency and fetches details using historical snapshots', async () => {
    const fetch = vi.fn(async (path: string) => path.endsWith('/image/thumbnail') ? json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404) : json(path === '/orders' ? [order] : order));
    vi.stubGlobal('fetch', fetch); show();
    expect(await screen.findByRole('heading', { name: order.id })).toBeVisible();
    for (const text of ['Customer: Current Customer', 'Items: 1', 'Subtotal: US$21.00', 'Discount: US$4.00', 'Total: US$17.00', 'Currency: USD']) expect(screen.getByText(text)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: `View order ${order.id}` }));
    const detail = screen.getByRole('dialog');
    expect(await within(detail).findByText('Historical Name')).toBeVisible();
    for (const text of ['Current Customer', 'current@example.invalid', 'Unit price: US$7.00', 'Quantity: 3', 'Line total: US$21.00']) expect(within(detail).getByText(text)).toBeVisible();
    expect(within(detail).queryByText('Current Catalog Name')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/orders/${order.id}`, expect.objectContaining({ headers: { Accept: 'application/json' } }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(contract.paths['/orders/{id}'].get.responses).toHaveProperty('200');
  });

  it('shows details404 API code/request ID and allows explicit read retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ code: 'ORDER_NOT_FOUND', message: 'The order was not found.' }, 404)).mockResolvedValueOnce(json(order)).mockImplementation(async () => json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404));
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><OrderDetailsDialog id={order.id} onClose={vi.fn()} /></MantineProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('ORDER_NOT_FOUND');
    expect(screen.getByRole('alert')).toHaveTextContent('order-123');
    fireEvent.click(screen.getByRole('button', { name: 'Retry details' }));
    expect(await screen.findByText('Historical Name')).toBeVisible();
  });

  it('validates active IDs, unique nonempty items and whole quantity1..10000', () => {
    const row = { rowId: 1, productId: first.id, quantity: '1' };
    for (const quantity of ['1', '10000']) expect(validateOrderDraft(customer.id, [{ ...row, quantity }], [customer], [first]).items[0]?.quantity).toBe(Number(quantity));
    for (const quantity of ['', '0', '-1', '1.0', '1e2', '1.5', '10001']) expect(() => validateOrderDraft(customer.id, [{ ...row, quantity }], [customer], [first])).toThrow();
    expect(() => validateOrderDraft(customer.id, [], [customer], [first])).toThrow();
    expect(() => validateOrderDraft(customer.id, [row, { ...row, rowId: 2 }], [customer], [first])).toThrow();
    expect(() => validateOrderDraft(customer.id, [row], [{ ...customer, active: false }], [first])).toThrow();
    expect(() => validateOrderDraft(customer.id, [row], [customer], [{ ...first, active: false }])).toThrow();
  });

  it('loads active choices, keeps stable rows after removal, sends multiitem IDs/quantities once pending, then reconciles server success despite refresh failure', async () => {
    let resolve!: (response: Response) => void; let reads = 0;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done; });
      if (path === '/orders') return Promise.resolve(++reads === 1 ? json([]) : json({ code: 'SERVICE_UNAVAILABLE', message: 'Refresh unavailable.' }, 503));
      return Promise.resolve(choices(path));
    });
    vi.stubGlobal('fetch', fetch); show(); await screen.findByText('No orders yet');
    fireEvent.click(screen.getByRole('button', { name: 'New order' })); await selectFirst();
    expect(screen.queryByRole('option', { name: /Inactive/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(within(screen.getByLabelText('Product 2')).queryByRole('option', { name: first.name })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Product 2'), { target: { value: second.id } });
    fireEvent.change(screen.getByLabelText('Quantity 2'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(screen.getByLabelText('Product 1')).toHaveValue(second.id);
    expect(screen.getByLabelText('Quantity 1')).toHaveValue('9');
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Product 2'), { target: { value: first.id } });
    fireEvent.change(screen.getByLabelText('Quantity 2'), { target: { value: '2' } });
    const submit = screen.getByRole('button', { name: 'Create order' });
    fireEvent.click(submit); fireEvent.click(submit); expect(submit).toBeDisabled();
    const writes = fetch.mock.calls.filter(([, o]) => o?.method === 'POST'); expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(['/orders', expect.objectContaining({ method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: customer.id, items: [{ productId: second.id, quantity: 9 }, { productId: first.id, quantity: 2 }] }) })]);
    resolve(json(order, 201));
    expect(await screen.findByRole('status')).toHaveTextContent('Order created successfully');
    expect(await screen.findByText('Order refresh failed')).toBeVisible();
    expect(screen.getByText('Total: US$17.00')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Inspect created order' })).toBeVisible();
    expect(contract.paths['/orders'].post.responses).toHaveProperty('201');
  });

  it.each(['empty', 'network'])('handles %s choices and prevents creation', async state => {
    vi.stubGlobal('fetch', state === 'empty' ? vi.fn(async () => json([])) : vi.fn().mockRejectedValue(new TypeError('offline')));
    dialog();
    if (state === 'empty') expect(await screen.findByText('No active customers available.')).toBeVisible();
    else expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load order choices');
    expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
  });

  it.each(['missing', 'inactive', 'validation', 'network', '500'] as const)('retains draft on %s creation failure without replay', async failure => {
    const errors = { missing: { code: 'PRODUCT_NOT_FOUND', message: 'The product was not found.' }, inactive: { code: 'PRODUCT_INACTIVE', message: 'The product is inactive.' }, validation: { code: 'INVALID_ORDER_QUANTITY', message: 'Order item quantities must be positive integers and the consolidated quantity must not exceed 10,000.' }, '500': { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected failure.' } };
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (!options?.method) return choices(path);
      if (failure === 'network') throw new TypeError('offline');
      return json(errors[failure], failure === 'missing' ? 404 : failure === 'inactive' ? 409 : failure === 'validation' ? 400 : 500);
    });
    vi.stubGlobal('fetch', fetch); dialog(); await selectFirst();
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    const alert = await screen.findByRole('alert');
    if (failure === 'network' || failure === '500') expect(alert).toHaveTextContent('The outcome is uncertain');
    else expect(alert).toHaveTextContent(errors[failure].code);
    expect(screen.getByLabelText('Quantity 1')).toHaveValue('7');
    expect(screen.getByLabelText('Customer')).toHaveValue(customer.id);
    expect(fetch.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Retry order|Delete order|Cancel order/ })).not.toBeInTheDocument();
  });

  it('navigates Orders, Customers and Products without repeated initial reads', async () => {
    const fetch = vi.fn(async (_path: string) => json([])); vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><App /></MantineProvider>);
    await screen.findByText('No products yet');
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(await screen.findByText('No orders yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
    expect(await screen.findByText('No customers yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(screen.getByRole('button', { name: 'Add product' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByRole('button', { name: 'New order' })).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
});
