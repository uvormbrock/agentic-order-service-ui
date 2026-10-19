import { apiGet, apiRequest } from '../../shared/api/client';
import type { paths, components } from '../../shared/api/schema';

export type Product = components['schemas']['ProductResponse'];
type ProductList = paths['/products']['get']['responses'][200]['content']['application/json'];

export async function listProducts(signal: AbortSignal): Promise<ProductList> {
  const response = await apiGet('/products', 'application/json', signal);
  return response.json();
}

export async function getProductThumbnail(id: string, signal: AbortSignal): Promise<Blob> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('The backend returned a noncanonical product identifier.');
  }
  const response = await apiGet(`/products/${id}/image/thumbnail`, 'image/png', signal);
  return response.blob();
}

export type ProductDetails = components['schemas']['ProductDetailsRequest'];
function productPath(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid product identifier.');
  return `/products/${id}`;
}
async function saveJson(path: string, method: string, body: ProductDetails | components['schemas']['DeactivateProductRequest']): Promise<Product> {
  const response = await apiRequest(path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return response.json();
}
export function createProduct(details: ProductDetails): Promise<Product> { return saveJson('/products', 'POST', details); }
export function updateProduct(id: string, details: ProductDetails): Promise<Product> { return saveJson(productPath(id), 'PUT', details); }
export function deactivateProduct(id: string): Promise<Product> { return saveJson(productPath(id), 'PATCH', { active: false }); }
export async function uploadProductImage(id: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await apiRequest(`${productPath(id)}/image`, { method: 'PUT', body: form });
}
