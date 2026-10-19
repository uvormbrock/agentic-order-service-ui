import { useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { ApiRequestError } from '../../shared/api/client';
import { createCustomer, deactivateCustomer, deleteCustomer, updateCustomer, type Customer, type CustomerDetails } from './api';

export type CustomerAction = { kind: 'create' } | { kind: 'edit' | 'deactivate' | 'delete'; customer: Customer };
const unicodeWhitespace = /\p{White_Space}/u;
function stripWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && unicodeWhitespace.test(value[start])) start++;
  while (end > start && unicodeWhitespace.test(value[end - 1])) end--;
  return value.slice(start, end);
}
export function validateCustomerDetails(name: string, email: string): CustomerDetails {
  const normalizedName = stripWhitespace(name);
  const normalizedEmail = stripWhitespace(email).toLowerCase();
  if (/\p{Surrogate}/u.test(normalizedName) || [...normalizedName].length < 1 || [...normalizedName].length > 200) throw new Error('Name must contain 1–200 Unicode characters after surrounding whitespace is removed.');
  if (!/^[\x00-\x7f]+$/.test(stripWhitespace(email)) || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter an ASCII email address up to 254 characters. The backend validates the address and its uniqueness.');
  return { name: normalizedName, email: normalizedEmail };
}
export function CustomerErrorDetails({ error }: { error: Error }) {
  return <><Text size="sm">{error.message}</Text>{error instanceof ApiRequestError && error.code && <Text size="sm">Code: {error.code}</Text>}{error instanceof ApiRequestError && error.requestId && <Text size="sm">Request ID: {error.requestId}</Text>}</>;
}
export function CustomerDialog({ action, onClose, onSaved, onDeleted }: {
  action: CustomerAction; onClose: () => void; onSaved: (customer: Customer) => void; onDeleted: (customer: Customer) => void;
}) {
  const customer = action.kind === 'create' ? undefined : action.customer;
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const title = action.kind === 'create' ? 'Create customer' : action.kind === 'edit' ? 'Edit customer' : action.kind === 'deactivate' ? 'Deactivate customer' : 'Delete customer';
  async function submit() {
    if (guard.current) return;
    setError(undefined); setUncertain(false);
    let details: CustomerDetails | undefined;
    try { if (action.kind === 'create' || action.kind === 'edit') details = validateCustomerDetails(name, email); }
    catch (reason) { setError(reason as Error); return; }
    guard.current = true; setPending(true);
    try {
      if (action.kind === 'delete') { await deleteCustomer(action.customer.id); onDeleted(action.customer); }
      else {
        const result = action.kind === 'create' ? await createCustomer(details!) : action.kind === 'edit' ? await updateCustomer(action.customer.id, details!) : await deactivateCustomer(action.customer.id);
        onSaved(result);
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Request failed.'));
      setUncertain(!(reason instanceof ApiRequestError) || reason.status === undefined || reason.status === 500);
    } finally { guard.current = false; setPending(false); }
  }
  const blockedDeletion = action.kind === 'delete' && error instanceof ApiRequestError && error.status === 409 && error.code === 'CUSTOMER_HAS_ORDERS';
  return <Modal opened onClose={() => { if (!guard.current) onClose(); }} title={title} closeOnClickOutside={!pending} closeOnEscape={!pending} withCloseButton={!pending}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}><Stack>
      {(action.kind === 'create' || action.kind === 'edit') && <><TextInput label="Customer name" value={name} onChange={event => setName(event.currentTarget.value)} disabled={pending} /><TextInput label="Email" inputMode="email" value={email} onChange={event => setEmail(event.currentTarget.value)} disabled={pending} /></>}
      {action.kind === 'deactivate' && <Text>Deactivate “{customer!.name}”? The customer remains in the list. Deactivation cannot be reversed through the current API.</Text>}
      {action.kind === 'delete' && <Text>Permanently delete “{customer!.name}” ({customer!.email})? This cannot be undone. Customers with existing orders cannot be deleted.</Text>}
      {error && <Alert color="red" title="Request unsuccessful" role="alert"><CustomerErrorDetails error={error} />{blockedDeletion && <Text size="sm" mt="sm">Existing orders block deletion. This customer has been retained; no deactivation was attempted.</Text>}{uncertain && <Text size="sm" mt="sm">The outcome is uncertain; the operation may have completed. Refresh the customer list and check the customer before retrying. Your input has been retained.</Text>}</Alert>}
      <Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" loading={pending} disabled={pending} color={action.kind === 'deactivate' || action.kind === 'delete' ? 'red' : undefined}>{action.kind === 'deactivate' ? 'Confirm deactivation' : action.kind === 'delete' ? 'Confirm deletion' : 'Save customer'}</Button></Group>
    </Stack></form>
  </Modal>;
}
