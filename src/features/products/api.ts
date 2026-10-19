import { apiGet, apiRequest, invalidResponse } from '../../shared/api/client';
import type { paths, components } from '../../shared/api/schema';
export type Product = components['schemas']['ProductResponse'];
type ProductList = paths['/products']['get']['responses'][200]['content']['application/json'];
export async function listProducts(signal: AbortSignal): Promise<ProductList> {
  return apiGet('/products', 'application/json', signal, response => response.json());
}
export async function getProductThumbnail(id: string, signal: AbortSignal): Promise<Blob> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('The backend returned a noncanonical product identifier.');
  }
  return apiGet(`/products/${id}/image/thumbnail`, 'image/png', signal, response => response.blob());
}
export type ProductDetails = components['schemas']['ProductDetailsRequest'];
function productPath(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Invalid product identifier.');
  return `/products/${id}`;
}
async function saveJson(path: string, method: string, body: ProductDetails | components['schemas']['DeactivateProductRequest'], signal?: AbortSignal, id?: string): Promise<Product> {
  return apiRequest(path, { method, signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, async (response) => {
    const fail = () => invalidResponse(response, 'The backend returned an unusable product confirmation. Refresh the catalog before retrying.');
    if (response.status !== (method === 'POST' ? 201 : 200))
      throw fail();
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object')
      throw fail();
    const product = value as Record<string, unknown>;
    if (typeof product.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id) ||
      (id && product.id.toLowerCase() !== id.toLowerCase()) ||
      typeof product.name !== 'string' ||
      typeof product.price !== 'number' ||
      !Number.isFinite(product.price) ||
      typeof product.active !== 'boolean' ||
      (method === 'PATCH' && product.active !== false))
      throw fail();
    return value as Product;
  });
}
export function createProduct(details: ProductDetails, signal?: AbortSignal): Promise<Product> { return saveJson('/products', 'POST', details, signal); }
export function updateProduct(id: string, details: ProductDetails, signal?: AbortSignal): Promise<Product> { return saveJson(productPath(id), 'PUT', details, signal, id); }
export function deactivateProduct(id: string, signal?: AbortSignal): Promise<Product> { return saveJson(productPath(id), 'PATCH', { active: false }, signal, id); }
export async function uploadProductImage(id: string, file: File, signal?: AbortSignal): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await apiRequest(`${productPath(id)}/image`, { method: 'PUT', body: form, signal }, response => {
    if (response.status !== 204)
      throw invalidResponse(response, 'Image upload was not confirmed with HTTP 204. Check the image before retrying.');
  });
}
