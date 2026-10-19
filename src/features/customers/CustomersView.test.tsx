import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../../api/openapi.json';
import { App } from '../../app/App';
import { CustomersView } from './CustomersView';
import { CustomerDialog, validateCustomerDetails } from './CustomerDialog';

const customer = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Alice', email: 'alice@example.com', active: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'customer-123' } });
const show = () => render(<MantineProvider><CustomersView /></MantineProvider>);
const fill = () => {
  fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: ' Bob ' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' BOB@EXAMPLE.COM ' } });
};

describe('customer management integration', () => {
  it('shows loading, retries initial failures without false empty state, then shows an empty list', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch); show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading customers');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server');
    expect(screen.getByRole('alert')).not.toHaveTextContent('BACKEND_URL');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading customers');
    expect(screen.queryByText('No customers yet')).not.toBeInTheDocument();
    resolve(json([]));
    expect(await screen.findByText('No customers yet')).toBeVisible();
    expect(fetch).toHaveBeenCalledWith('/customers', expect.objectContaining({ headers: { Accept: 'application/json' } }));
    expect(contract.paths['/customers'].get.responses['200'].content).toHaveProperty('application/json');
  });

  it('renders active/inactive names and emails, with edit/delete for both and deactivate only active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([customer, { ...customer, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Legacy', email: 'legacy@example.com', active: false }])));
    show();
    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeVisible();
    expect(screen.getByText('alice@example.com')).toBeVisible();
    expect(screen.getByText('legacy@example.com')).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
    expect(screen.getByText('Inactive', { exact: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Legacy' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete Legacy' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Deactivate Legacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reactivate/ })).not.toBeInTheDocument();
  });

  it('validates normalized Unicode name and ASCII email before any request', () => {
    expect(validateCustomerDetails('\u0085😀\u0085', ' USER@EXAMPLE.COM ')).toEqual({ name: '😀', email: 'user@example.com' });
    for (const [name, email] of [[' ', 'a@b'], ['😀'.repeat(201), 'a@b'], ['Name', 'ü@example.com'], ['Name', 'bad'], ['Name', 'a'.repeat(250) + '@example.com']]) expect(() => validateCustomerDetails(name!, email!)).toThrow();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><CustomerDialog action={{ kind: 'create' }} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} /></MantineProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Name must contain');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves Unicode trimming semantics, interior whitespace and characters outside White_Space', () => {
    expect(validateCustomerDetails('\u0085\u00a0\u2003Alice\u202f\u3000', '\t USER@EXAMPLE.COM\n')).toEqual({ name: 'Alice', email: 'user@example.com' });
    expect(validateCustomerDetails('  Alice\u2003Bob  ', 'a@b')).toHaveProperty('name', 'Alice\u2003Bob');
    expect(validateCustomerDetails('\ufeffAlice\ufeff', 'a@b')).toHaveProperty('name', '\ufeffAlice\ufeff');
    expect(validateCustomerDetails(' '.repeat(10000) + '😀' + '\u0085'.repeat(10000), 'a@b')).toHaveProperty('name', '😀');
    expect(() => validateCustomerDetails('\u0085\u2003\u3000', 'a@b')).toThrow('Name must contain');
  });

  it.each(['create', 'edit'] as const)('sends normalized %s once while pending, preserving inactive edit and successful save despite refresh failure', async kind => {
    let resolve!: (response: Response) => void;
    let reads = 0;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method) return new Promise<Response>(done => { resolve = done; });
      return Promise.resolve(++reads === 1 ? json(kind === 'create' ? [] : [{ ...customer, active: false }]) : json({ code: 'SERVICE_UNAVAILABLE', message: 'Refresh temporarily unavailable.' }, 503));
    });
    vi.stubGlobal('fetch', fetch); show();
    if (kind === 'create') { await screen.findByText('No customers yet'); fireEvent.click(screen.getByRole('button', { name: 'Add customer' })); }
    else fireEvent.click(await screen.findByRole('button', { name: 'Edit Alice' }));
    fill(); const button = screen.getByRole('button', { name: 'Save customer' });
    fireEvent.click(button); fireEvent.click(button); expect(button).toBeDisabled();
    const writes = fetch.mock.calls.filter(([, options]) => options?.method);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([kind === 'create' ? '/customers' : `/customers/${customer.id}`, expect.objectContaining({ method: kind === 'create' ? 'POST' : 'PUT', body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }), headers: { Accept: 'application/json', 'Content-Type': 'application/json' } })]);
    resolve(json({ ...customer, name: 'Bob', email: 'bob@example.com', active: kind === 'create' }, kind === 'create' ? 201 : 200));
    expect(await screen.findByText('Customer saved successfully.')).toBeVisible();
    expect(await screen.findByText('Customer refresh failed')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeVisible();
    if (kind === 'edit') expect(screen.getByText('Inactive', { exact: true })).toBeVisible();
  });

  it('retains duplicate-email errors, input, API code and request ID without automatic retry', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ code: 'DUPLICATE_EMAIL', message: 'The email address already belongs to another customer.' }, 409));
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><CustomerDialog action={{ kind: 'create' }} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} /></MantineProvider>);
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('DUPLICATE_EMAIL');
    expect(screen.getByRole('alert')).toHaveTextContent('customer-123');
    expect(screen.getByLabelText('Email')).toHaveValue(' BOB@EXAMPLE.COM ');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requires deactivation confirmation, sends only active:false and refreshes inactive result', async () => {
    let active = true;
    const fetch = vi.fn(async (_path: string, options?: RequestInit) => options?.method === 'PATCH' ? (active = false, json({ ...customer, active })) : json([{ ...customer, active }]));
    vi.stubGlobal('fetch', fetch); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Alice' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot be reversed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetch.mock.calls.filter(([, o]) => o?.method)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deactivation' }));
    expect(await screen.findByText('Inactive', { exact: true })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(`/customers/${customer.id}`, expect.objectContaining({ method: 'PATCH', body: '{"active":false}' }));
    await waitFor(() => expect(fetch.mock.calls.filter(([, o]) => !o?.method)).toHaveLength(2));
  });

  it.each([true, false])('deletes active=%s only after confirmation, consumes bodyless204 and refreshes list', async active => {
    let deleted = false;
    const fetch = vi.fn(async (_path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }); }
      return json(deleted ? [] : [{ ...customer, active }]);
    });
    vi.stubGlobal('fetch', fetch); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alice' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('cannot be undone');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetch.mock.calls.filter(([, o]) => o?.method)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    expect(await screen.findByText('No customers yet')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('deleted successfully');
    expect(fetch).toHaveBeenCalledWith(`/customers/${customer.id}`, expect.objectContaining({ method: 'DELETE' }));
    expect(fetch.mock.calls.filter(([, o]) => !o?.method)).toHaveLength(2);
    expect(contract.paths['/customers/{id}'].delete.responses).toHaveProperty('204');
  });

  it.each(['orders', 'network', '500'] as const)('retains customer and delete dialog on %s failure without fallback writes, refresh or replay', async failure => {
    const fetch = vi.fn(async (_path: string, options?: RequestInit) => {
      if (!options?.method) return json([customer]);
      if (failure === 'network') throw new TypeError('offline');
      return failure === 'orders' ? json({ code: 'CUSTOMER_HAS_ORDERS', message: 'Customer cannot be deleted because existing orders reference this customer. Deactivate the customer instead.' }, 409) : json({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error.' }, 500);
    });
    vi.stubGlobal('fetch', fetch); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(failure === 'orders' ? 'Existing orders block deletion' : 'The outcome is uncertain');
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(fetch.mock.calls.filter(([, o]) => o?.method === 'DELETE')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH')).toHaveLength(0);
    expect(fetch.mock.calls.filter(([, o]) => !o?.method)).toHaveLength(1);
  });

  it('navigates Products and Customers while preserving product creation access and avoiding repeated initial reads', async () => {
    const fetch = vi.fn(async (_path: string) => json([])); vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><App /></MantineProvider>);
    await screen.findByText('No products yet');
    fireEvent.click(screen.getByRole('button', { name: 'Customers' }));
    expect(await screen.findByText('No customers yet')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Customers' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(screen.getByText('No products yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Create product');
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetch.mock.calls.filter(([path]) => path === '/products')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([path]) => path === '/customers')).toHaveLength(1);
  });
});
