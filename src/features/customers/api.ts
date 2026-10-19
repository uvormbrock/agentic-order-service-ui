import { apiGet, apiRequest } from '../../shared/api/client';
import type { components, paths } from '../../shared/api/schema';

export type Customer = components['schemas']['CustomerResponse'];
export type CustomerDetails = components['schemas']['CustomerDetailsRequest'];
type CustomerList = paths['/customers']['get']['responses'][200]['content']['application/json'];
function customerPath(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid customer identifier.');
  return `/customers/${id}`;
}
export async function listCustomers(signal: AbortSignal): Promise<CustomerList> {
  return (await apiGet('/customers', 'application/json', signal)).json();
}
async function saveJson(path: string, method: string, body: CustomerDetails | components['schemas']['DeactivateCustomerRequest']): Promise<Customer> {
  return (await apiRequest(path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
}
export function createCustomer(details: CustomerDetails): Promise<Customer> { return saveJson('/customers', 'POST', details); }
export function updateCustomer(id: string, details: CustomerDetails): Promise<Customer> { return saveJson(customerPath(id), 'PUT', details); }
export function deactivateCustomer(id: string): Promise<Customer> { return saveJson(customerPath(id), 'PATCH', { active: false }); }
export async function deleteCustomer(id: string): Promise<void> {
  const response = await apiRequest(customerPath(id), { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (response.status !== 204) throw new Error('Unexpected delete response. Refresh the customer list before retrying.');
}
