import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../../api/openapi.json';
import { ProductsView } from './ProductsView';

const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const secondId = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
const product = { id, name: 'Demo Keyboard', price: 50, active: true };
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
const show = () => render(<MantineProvider><ProductsView /></MantineProvider>);

describe('product catalog integration', () => {
  it('keeps an initial failed-load retry in loading and initial-error states until a catalog is known', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch); show();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
    resolve(new Response('', { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load product catalog');
    expect(screen.queryByText('Catalog refresh failed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing the last known catalog/)).not.toBeInTheDocument();
  });

  it('shows loading then an empty catalog', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    resolve(json([]));
    expect(await screen.findByText('No products yet')).toBeVisible();
  });

  it('renders product fields, dedicated PNG thumbnails and missing images; releases blob URLs', async () => {
    const png = new Blob(['png bytes'], { type: 'image/png' });
    const create = vi.fn((_blob: Blob) => 'blob:thumbnail');
    const revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    });
    const fetch = vi.fn(async (path: string) => {
      if (path === '/products') return json([product, { ...product, id: secondId, name: 'Spare Mouse', price: 12.5, active: false }]);
      if (path === `/products/${id}/image/thumbnail`) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      return json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.' }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    const view = show();
    expect(await screen.findByRole('heading', { name: 'Demo Keyboard' })).toBeVisible();
    expect(screen.getByText('€50.00')).toBeVisible();
    expect(screen.getByText('€12.50')).toBeVisible();
    expect(screen.getByText('Active', { exact: true })).toBeVisible();
    expect(screen.getByText('Inactive', { exact: true })).toBeVisible();
    const image = await screen.findByRole('img', { name: 'Demo Keyboard thumbnail' });
    expect(image).toHaveAttribute('src', 'blob:thumbnail');
    expect(await screen.findByText('No image')).toBeVisible();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ type: 'image/png' });
    // Assert the actual fetch requests against the checked-in OpenAPI representations.
    expect(contract.paths['/products'].get.responses['200'].content).toHaveProperty('application/json');
    expect(contract.paths['/products/{id}/image/thumbnail'].get.responses['200'].content).toHaveProperty('image/png');
    expect(fetch).toHaveBeenCalledWith('/products', expect.objectContaining({ headers: { Accept: 'application/json' } }));
    expect(fetch).toHaveBeenCalledWith(`/products/${id}/image/thumbnail`, expect.objectContaining({ headers: { Accept: 'image/png' } }));
    expect(fetch).toHaveBeenCalledTimes(3);
    fireEvent.error(image);
    expect(screen.getByText('Image unavailable')).toBeVisible();
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:thumbnail');
  });

  it('distinguishes a missing product from a missing image', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/products'
      ? json([product]) : json({ code: 'PRODUCT_NOT_FOUND', message: 'The product was not found.' }, 404)));
    show();
    expect(await screen.findByText('Image unavailable')).toBeVisible();
    expect(screen.queryByText('No image')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: product.name })).toBeVisible();
  });

  it('shows server message, API code and request ID and supports an explicit retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ code: 'SERVICE_UNAVAILABLE', message: 'A required service is temporarily unavailable.' }, 503, { 'X-Request-ID': 'request-123' })).mockResolvedValueOnce(json([]));
    vi.stubGlobal('fetch', fetch);
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('A required service is temporarily unavailable.');
    expect(screen.getByText('Code: SERVICE_UNAVAILABLE')).toBeVisible();
    expect(screen.getByText('Request ID: request-123')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No products yet')).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'proxy'])('distinguishes transport and HTTP failures for %s errors', async kind => {
    vi.stubGlobal('fetch', kind === 'network'
      ? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      : vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    show();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(kind === 'network' ? 'Unable to reach the server' : 'HTTP 500'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('BACKEND_URL');
    if (kind === 'proxy') expect(screen.getByRole('alert')).not.toHaveTextContent(/Cannot connect|Unable to reach/);
  });
});
