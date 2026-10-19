import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderDetailsDialog } from './OrderDetailsDialog';

const firstId = '11111111-2222-3333-4444-555555555555';
const secondId = '22222222-2222-3333-4444-555555555555';
const order = {
  id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  customer: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Customer', email: 'customer@example.invalid', active: false },
  items: [
    { productId: firstId, productName: 'Historical Keyboard', quantity: 2, unitPrice: 50, lineTotal: 100 },
    { productId: secondId, productName: 'Historical Mouse', quantity: 1, unitPrice: 25, lineTotal: 25 },
  ], subtotal: 125, discount: 10, total: 115, currency: 'EUR',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const show = () => render(<MantineProvider><OrderDetailsDialog id={order.id} onClose={vi.fn()} /></MantineProvider>);

describe('order detail thumbnails', () => {
  it('associates distinct PNG endpoints with historical product IDs and releases object URLs', async () => {
    let nextUrl = 0;
    const create = vi.fn((_blob: Blob) => `blob:order-${++nextUrl}`);
    const revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const fetch = vi.fn(async (path: string) => path === `/orders/${order.id}`
      ? json(order) : new Response(new Blob([path], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    const view = show();
    expect(await screen.findByRole('img', { name: 'Historical Keyboard thumbnail' })).toHaveAttribute('src', 'blob:order-1');
    expect(await screen.findByRole('img', { name: 'Historical Mouse thumbnail' })).toHaveAttribute('src', 'blob:order-2');
    for (const id of [firstId, secondId]) expect(fetch).toHaveBeenCalledWith(`/products/${id}/image/thumbnail`, expect.objectContaining({ headers: { Accept: 'image/png' } }));
    expect(create.mock.calls.map(([blob]) => blob.type)).toEqual(['image/png', 'image/png']);
    expect(screen.getByText('Unit price: €50.00')).toBeVisible();
    expect(screen.getByText('Unit price: €25.00')).toBeVisible();
    expect(screen.getByText('Total: €115.00')).toBeVisible();
    expect(fetch).not.toHaveBeenCalledWith('/products', expect.anything());
    expect(fetch).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:order-1');
    expect(revoke).toHaveBeenCalledWith('blob:order-2');
  });

  it.each(['missing', 'network', '500'] as const)('isolates %s image failures from historical text and order totals', async failure => {
    const fetch = vi.fn(async (path: string) => {
      if (path === `/orders/${order.id}`) return json(order);
      if (failure === 'network') throw new TypeError('offline');
      return failure === 'missing' ? json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404) : new Response('', { status: 500 });
    });
    vi.stubGlobal('fetch', fetch); show();
    await waitFor(() => expect(screen.getAllByText(failure === 'missing' ? 'No image' : 'Image unavailable')).toHaveLength(2));
    for (const text of ['Historical Keyboard', 'Historical Mouse', 'Unit price: €50.00', 'Quantity: 2', 'Line total: €100.00', 'Subtotal: €125.00', 'Discount: €10.00', 'Total: €115.00']) expect(screen.getByText(text)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalledWith('/products', expect.anything());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
