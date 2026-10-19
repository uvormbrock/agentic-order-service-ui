import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import contract from '../../../api/openapi.json';
import { ProductDialog, validateProductDetails, validateProductImage } from './ProductDialog';
import { ProductsView } from './ProductsView';
import { createProduct, deactivateProduct, updateProduct, uploadProductImage } from './api';

const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const product = { id, name: 'Keyboard', price: 50, active: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'write-123' } });
const show = () => render(<MantineProvider><ProductsView /></MantineProvider>);
const fill = (name = ' New product ', price = '12.50') => {
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Price (EUR)'), { target: { value: price } });
};
const missing = () => json({ code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'No image.' }, 404);

describe('product writes', () => {
  it('validates Unicode names, literal decimal prices and image selection before writes', () => {
    expect(validateProductDetails('\u0085😀\u0085', '999999.99')).toEqual({ name: '😀', price: 999999.99 });
    expect(validateProductDetails('😀'.repeat(200), '0')).toHaveProperty('price', 0);
    for (const name of ['', '   ', '😀'.repeat(201), '\ud800']) expect(() => validateProductDetails(name, '1')).toThrow();
    for (const price of ['', '-1', '1e2', '1,50', '1.001', '1000000', 'NaN']) expect(() => validateProductDetails('Name', price)).toThrow();
    expect(validateProductImage(new File(['png'], 'ok.png', { type: 'image/png' })).name).toBe('ok.png');
    expect(validateProductImage(new File(['jpg'], 'ok.jpg', { type: 'image/jpeg' })).name).toBe('ok.jpg');
    for (const file of [null, new File([], 'empty.png', { type: 'image/png' }), new File(['gif'], 'bad.gif', { type: 'image/gif' })]) expect(() => validateProductImage(file)).toThrow();
  });

  it('sends exact OpenAPI JSON methods/bodies and bodyless multipart upload without Content-Type', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(product, 201)).mockResolvedValueOnce(json({ ...product, active: false })).mockResolvedValueOnce(json({ ...product, active: false })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const details = { name: 'Keyboard', price: 50 };
    await createProduct(details); await updateProduct(id, details); await deactivateProduct(id);
    const file = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(uploadProductImage(id, file)).resolves.toBeUndefined();
    for (const [index, method, path, body] of [[0, 'POST', '/products', details], [1, 'PUT', `/products/${id}`, details], [2, 'PATCH', `/products/${id}`, { active: false }]] as const) {
      expect(fetch.mock.calls[index]?.[0]).toBe(path);
      expect(fetch.mock.calls[index]?.[1]).toMatchObject({ method, body: JSON.stringify(body), headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
    }
    const upload = fetch.mock.calls[3];
    expect(upload?.[0]).toBe(`/products/${id}/image`);
    expect(upload?.[1].method).toBe('PUT');
    expect(new Headers(upload?.[1].headers).has('Content-Type')).toBe(false);
    expect(upload?.[1].body).toBeInstanceOf(FormData);
    expect(upload?.[1].body.get('file')).toBe(file);
    expect(contract.paths['/products'].post.responses).toHaveProperty('201');
    expect(contract.paths['/products/{id}'].put.responses).toHaveProperty('200');
    expect(contract.paths['/products/{id}'].patch.responses).toHaveProperty('200');
    expect(contract.paths['/products/{id}/image'].put.responses).toHaveProperty('204');
  });

  it('creates once while pending and distinguishes saved product from catalog refresh failure', async () => {
    let resolve!: (response: Response) => void;
    let reads = 0;
    const fetch = vi.fn((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return new Promise<Response>(done => { resolve = done; });
      if (path === '/products') return Promise.resolve(++reads === 1 ? json([]) : json({ code: 'SERVICE_UNAVAILABLE', message: 'Refresh unavailable.' }, 503));
      return Promise.resolve(missing());
    });
    vi.stubGlobal('fetch', fetch); show();
    await screen.findByText('No products yet');
    fireEvent.click(screen.getByRole('button', { name: 'Add product' })); fill();
    const button = screen.getByRole('button', { name: 'Save product' });
    fireEvent.click(button); fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    resolve(json({ ...product, name: 'New product', price: 12.5 }, 201));
    expect(await screen.findByText('Product saved successfully.')).toBeVisible();
    expect(await screen.findByText('Catalog refresh failed')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'New product' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add image to created product' })).toBeVisible();
  });

  it.each(['create', 'edit'] as const)('retains %s form on server rejection without replay', async kind => {
    const rejection = kind === 'create' ? { code: 'INVALID_NAME', message: 'The name must contain 1 to 200 Unicode code points after stripping surrounding whitespace.' } : { code: 'CONCURRENT_MODIFICATION', message: 'The resource was modified concurrently. Please reload and retry.' };
    const fetch = vi.fn().mockResolvedValue(json(rejection, kind === 'create' ? 400 : 409));
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><ProductDialog action={kind === 'create' ? { kind } : { kind, product: { ...product, active: false } }} onClose={vi.fn()} onSaved={vi.fn()} onImageSaved={vi.fn()} /></MantineProvider>);
    fill('Edited name', '15.25'); fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(rejection.message);
    expect(screen.getByRole('alert')).toHaveTextContent(rejection.code);
    expect(screen.getByRole('alert')).toHaveTextContent('write-123');
    expect(screen.getByLabelText('Product name')).toHaveValue('Edited name');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1].method).toBe(kind === 'create' ? 'POST' : 'PUT');
  });

  it('allows editing inactive products and requires confirmation before deactivation', async () => {
    let active = true;
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') { active = false; return json({ ...product, active }); }
      if (options?.method === 'PUT') return json({ ...product, name: 'Updated', active: false });
      return path === '/products' ? json([{ ...product, active }]) : missing();
    });
    vi.stubGlobal('fetch', fetch); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate Keyboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Keyboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deactivation' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Deactivate Keyboard' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Keyboard' })); fill('Updated', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /Reactivate|Delete/ })).not.toBeInTheDocument();
  });

  it.each(['network', '500'])('marks %s write outcome uncertain and never automatically replays', async failure => {
    const fetch = vi.fn();
    if (failure === 'network') fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    else fetch.mockResolvedValue(json({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected failure.' }, 500));
    vi.stubGlobal('fetch', fetch);
    render(<MantineProvider><ProductDialog action={{ kind: 'create' }} onClose={vi.fn()} onSaved={vi.fn()} onImageSaved={vi.fn()} /></MantineProvider>);
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The outcome is uncertain');
    expect(screen.getByLabelText('Price (EUR)')).toHaveValue('12.50');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports image opt-in rejection and refetches thumbnail after successful bodyless upload', async () => {
    let uploads = 0;
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (options?.method === 'PUT') return ++uploads === 1 ? json({ code: 'PRODUCT_IMAGE_WRITES_DISABLED', message: 'Image writes disabled.' }, 403) : new Response(null, { status: 204 });
      return path === '/products' ? json([product]) : missing();
    });
    vi.stubGlobal('fetch', fetch); show();
    fireEvent.click(await screen.findByRole('button', { name: 'Upload image for Keyboard' }));
    const dialog = screen.getByRole('dialog');
    const input = dialog.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['png'], 'image.png', { type: 'image/png' })] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload image' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PRODUCT_IMAGE_WRITES_DISABLED');
    expect(uploads).toBe(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload image' }));
    expect(await screen.findByText(/Image uploaded successfully/)).toBeVisible();
    await waitFor(() => expect(fetch.mock.calls.filter(([path]) => path.endsWith('/image/thumbnail'))).toHaveLength(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
