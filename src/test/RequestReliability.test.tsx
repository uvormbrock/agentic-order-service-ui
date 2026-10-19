import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerDialog, validateCustomerDetails } from '../features/customers/CustomerDialog';
import { NewOrderDialog } from '../features/orders/NewOrderDialog';
import { ProductDialog, validateProductDetails } from '../features/products/ProductDialog';
import { CustomerShopping } from '../features/shopping/CustomerShopping';
import { CheckoutDialog } from '../features/shopping/CheckoutDialog';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../shared/api/client';

const customer = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alice', email: 'alice@example.invalid', active: true };
const product = { id: '11111111-2222-3333-4444-555555555555', name: 'Keyboard', price: 50, active: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function settle() { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); }
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('shared name normalization', () => {
  it.each([
    ['\u0085\u00a0Keyboard\u00a0\u0085', 'Keyboard'],
    ['\ufeffKeyboard\ufeff', '\ufeffKeyboard\ufeff'],
    ['  Key  board  ', 'Key  board'],
    [' \u{1f680} Keyboard ', '\u{1f680} Keyboard'],
  ])('normalizes product and customer names consistently: %j', (input, expected) => {
    expect(validateProductDetails(input, '12.50').name).toBe(expected);
    expect(validateCustomerDetails(input, 'alice@example.invalid').name).toBe(expected);
  });
});

describe('write deadline recovery', () => {
  it.each(['create', 'edit', 'deactivate', 'image', 'delete', 'customer-create', 'customer-edit', 'customer-deactivate', 'order', 'checkout'] as const)('unlocks %s without replaying or discarding the draft', async kind => {
    vi.useFakeTimers();
    const saved = vi.fn();
    const close = vi.fn();
    const pending = vi.fn();
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method) return new Promise<Response>(() => {});
      return Promise.resolve(json(path === '/customers' ? [customer] : [product]));
    });
    vi.stubGlobal('fetch', fetch);
    const customerKind = kind.startsWith('customer-') ? kind.slice(9) as 'create' | 'edit' | 'deactivate' : undefined;
    const content = customerKind
      ? <CustomerDialog action={customerKind === 'create' ? { kind: customerKind } : { kind: customerKind, customer }} onClose={close} onSaved={saved} onDeleted={saved} />
      : kind === 'delete'
      ? <CustomerDialog action={{ kind: 'delete', customer }} onClose={close} onSaved={saved} onDeleted={saved} />
      : kind === 'order'
        ? <NewOrderDialog onClose={close} onSaved={saved} />
        : kind === 'checkout'
          ? <CheckoutDialog customer={customer} products={[product]} lines={[{ productId: product.id, quantity: '2' }]} onClose={close} onSaved={saved} onPending={pending} />
          : <ProductDialog action={kind === 'create' ? { kind } : { kind: kind as 'edit' | 'deactivate' | 'image', product }} onClose={close} onSaved={saved} onImageSaved={saved} />;
    const view = render(<MantineProvider>{content}</MantineProvider>);
    await settle();
    if (kind === 'create' || kind === 'edit') {
      fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Retained draft' } });
      fireEvent.change(screen.getByLabelText('Price (EUR)'), { target: { value: '12.50' } });
    }
    if (customerKind === 'create' || customerKind === 'edit') {
      fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Customer draft' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'draft@example.invalid' } });
    }
    if (kind === 'image') {
      const input = document.querySelector('input[type="file"]')!;
      fireEvent.change(input, { target: { files: [new File(['pixels'], 'image.png', { type: 'image/png' })] } });
    }
    if (kind === 'order') {
      fireEvent.change(screen.getByLabelText('Customer'), { target: { value: customer.id } });
      fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: product.id } });
      fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '2' } });
    }
    const buttonName = customerKind ? customerKind === 'deactivate' ? 'Confirm deactivation' : 'Save customer' : kind === 'delete' ? 'Confirm deletion' : kind === 'deactivate' ? 'Confirm deactivation' : kind === 'image' ? 'Upload image' : kind === 'order' ? 'Create order' : kind === 'checkout' ? 'Confirm order' : 'Save product';
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + 1); });
    expect(screen.getByRole('alert')).toHaveTextContent(/outcome is uncertain/i);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: buttonName })).toBeEnabled();
    if (kind === 'create' || kind === 'edit') expect(screen.getByLabelText('Product name')).toHaveValue('Retained draft');
    if (customerKind === 'create' || customerKind === 'edit') expect(screen.getByLabelText('Customer name')).toHaveValue('Customer draft');
    if (kind === 'image') expect(screen.getByText('image.png')).toBeInTheDocument();
    if (kind === 'order') expect(screen.getByLabelText('Quantity 1')).toHaveValue('2');
    if (kind === 'checkout') {
      expect(screen.getByText('Keyboard · Quantity: 2')).toBeInTheDocument();
      expect(pending.mock.calls).toEqual([[true], [false]]);
    }
    view.rerender(<MantineProvider>{content}</MantineProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    const writes = fetch.mock.calls.filter(([, options]) => options?.method);
    expect(writes).toHaveLength(1);
    expect(writes[0][1]?.signal?.aborted).toBe(true);
    if (kind === 'image') {
      expect(writes[0][0]).toBe(`/products/${product.id}/image`);
      expect((writes[0][1]?.body as FormData).get('file')).toBeInstanceOf(File);
    }
    expect(saved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('retains the actual shopping cart and releases the parent lock after checkout timeout', async () => {
    vi.useFakeTimers();
    const pending = vi.fn();
    let resolve!: (response: Response) => void;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done; });
      return Promise.resolve(json(path === '/customers' ? [customer] : path === '/products' ? [product] : []));
    });
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><CustomerShopping onPending={pending} /></MantineProvider>);
    await settle();
    fireEvent.change(screen.getByLabelText('Shopping customer'), { target: { value: customer.id } });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Add Keyboard to cart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + 1); });
    expect(pending).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled();
    expect(screen.getByLabelText('Shopping customer')).toBeEnabled();
    resolve(json({ id: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', customerId: customer.id, customer, items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 50, lineTotal: 50 }], subtotal: 50, discount: 0, total: 50, currency: 'EUR' }, 201));
    await settle();
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeEnabled();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });

  it('suppresses callbacks when an unmounted write resolves late', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const saved = vi.fn();
    const close = vi.fn();
    const view = render(<MantineProvider><ProductDialog action={{ kind: 'edit', product }} onClose={close} onSaved={saved} onImageSaved={saved} /></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    view.unmount();
    resolve(json(product));
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['product', 'customer'] as const)('retains the %s form after an invalid successful response', async kind => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 201)));
    const saved = vi.fn();
    render(<MantineProvider>{kind === 'product'
      ? <ProductDialog action={{ kind: 'create' }} onClose={vi.fn()} onSaved={saved} onImageSaved={saved} />
      : <CustomerDialog action={{ kind: 'create' }} onClose={vi.fn()} onSaved={saved} onDeleted={saved} />}</MantineProvider>);
    fireEvent.change(screen.getByLabelText(kind === 'product' ? 'Product name' : 'Customer name'), { target: { value: 'Draft' } });
    fireEvent.change(screen.getByLabelText(kind === 'product' ? 'Price (EUR)' : 'Email'), { target: { value: kind === 'product' ? '12.50' : 'draft@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: kind === 'product' ? 'Save product' : 'Save customer' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(/outcome is uncertain/i);
    expect(screen.getByLabelText(kind === 'product' ? 'Product name' : 'Customer name')).toHaveValue('Draft');
    expect(saved).not.toHaveBeenCalled();
  });
});
