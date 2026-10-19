import { apiGet, apiRequest, invalidResponse } from '../../shared/api/client';
import type { components, paths } from '../../shared/api/schema';
export type Customer = components['schemas']['CustomerResponse'];
export type CustomerDetails = components['schemas']['CustomerDetailsRequest'];
type CustomerList = paths['/customers']['get']['responses'][200]['content']['application/json'];
function customerPath(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Invalid customer identifier.');
  return `/customers/${id}`;
}
export async function listCustomers(signal: AbortSignal): Promise<CustomerList> {
  return apiGet('/customers', 'application/json', signal, response => response.json());
}
async function saveJson(path: string, method: string, body: CustomerDetails | components['schemas']['DeactivateCustomerRequest'], signal?: AbortSignal, id?: string): Promise<Customer> {
  return apiRequest(path, { method, signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, async (response) => {
    const fail = () => invalidResponse(response, 'The backend returned an unusable customer confirmation. Refresh the customer list before retrying.');
    if (response.status !== (method === 'POST' ? 201 : 200))
      throw fail();
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object')
      throw fail();
    const customer = value as Record<string, unknown>;
    if (typeof customer.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer.id) ||
      (id && customer.id.toLowerCase() !== id.toLowerCase()) ||
      typeof customer.name !== 'string' ||
      typeof customer.email !== 'string' ||
      typeof customer.active !== 'boolean' ||
      (method === 'PATCH' && customer.active !== false))
      throw fail();
    return value as Customer;
  });
}
export function createCustomer(details: CustomerDetails, signal?: AbortSignal): Promise<Customer> { return saveJson('/customers', 'POST', details, signal); }
export function updateCustomer(id: string, details: CustomerDetails, signal?: AbortSignal): Promise<Customer> { return saveJson(customerPath(id), 'PUT', details, signal, id); }
export function deactivateCustomer(id: string, signal?: AbortSignal): Promise<Customer> { return saveJson(customerPath(id), 'PATCH', { active: false }, signal, id); }
export async function deleteCustomer(id: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(customerPath(id), { method: 'DELETE', signal, headers: { Accept: 'application/json' } }, response => {
    if (response.status !== 204)
      throw invalidResponse(response, 'Unexpected delete response. Refresh the customer list before retrying.');
  });
}
