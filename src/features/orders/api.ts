import { apiGet, apiRequest, invalidResponse } from '../../shared/api/client';
import type { components, paths } from '../../shared/api/schema';
export type Order = components['schemas']['OrderResponse'];
export type CreateOrder = components['schemas']['CreateOrderRequest'];
export async function listOrders(signal: AbortSignal): Promise<paths['/orders']['get']['responses'][200]['content']['application/json']> {
  return apiGet('/orders', 'application/json', signal, response => response.json());
}
export async function getOrder(id: string, signal: AbortSignal): Promise<Order> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Invalid order identifier.');
  return apiGet(`/orders/${id}`, 'application/json', signal, response => response.json());
}
export async function createOrder(body: CreateOrder, signal?: AbortSignal): Promise<Order> {
  return apiRequest('/orders', { method: 'POST', signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, async (response) => {
    if (response.status !== 201)
      throw invalidResponse(response, 'Order creation was not confirmed with HTTP 201. Check Orders before retrying.');
    const value: unknown = await response.json();
    const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object';
    const finite = (input: unknown) => typeof input === 'number' && Number.isFinite(input);
    if (!record(value) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) ||
      typeof value.customerId !== 'string' ||
      value.customerId.toLowerCase() !== body.customerId.toLowerCase() ||
      typeof value.currency !== 'string' ||
      !/^[A-Za-z]{3}$/.test(value.currency) ||
      !record(value.customer) ||
      typeof value.customer.id !== 'string' ||
      value.customer.id.toLowerCase() !== body.customerId.toLowerCase() ||
      typeof value.customer.name !== 'string' ||
      typeof value.customer.email !== 'string' ||
      typeof value.customer.active !== 'boolean' ||
      !finite(value.subtotal) ||
      !finite(value.discount) ||
      !finite(value.total) ||
      !Array.isArray(value.items) ||
      !value.items.length ||
      !value.items.every(item => record(item) && typeof item.productId === 'string' && typeof item.productName === 'string' && finite(item.unitPrice) && finite(item.lineTotal) && typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity >= 1)) {
      throw invalidResponse(response, 'The backend returned an unusable order confirmation. Check Orders before retrying.');
    }
    return value as Order;
  });
}
