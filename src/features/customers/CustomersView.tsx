import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { listCustomers, type Customer } from './api';
import { CustomerDialog, CustomerErrorDetails, type CustomerAction } from './CustomerDialog';

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const hasCatalog = useRef(false);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<CustomerAction>();
  const [notice, setNotice] = useState('');
  const [refreshError, setRefreshError] = useState<Error>();
  function saved(customer: Customer) {
    hasCatalog.current = true;
    setCustomers(current => current.some(item => item.id === customer.id) ? current.map(item => item.id === customer.id ? customer : item) : [...current, customer]);
    setNotice('Customer saved successfully.');
    setAttempt(value => value + 1);
  }
  function deleted(customer: Customer) {
    hasCatalog.current = true;
    setCustomers(current => current.filter(item => item.id !== customer.id));
    setNotice(`Customer “${customer.name}” deleted successfully.`);
    setAttempt(value => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(!hasCatalog.current); setFetching(true); setError(undefined); setRefreshError(undefined);
    listCustomers(controller.signal).then(result => {
      if (!controller.signal.aborted) { hasCatalog.current = true; setCustomers(result); }
    }).catch(reason => {
      if (controller.signal.aborted) return;
      const failure = reason instanceof Error ? reason : new Error('Unable to load customers.');
      if (hasCatalog.current) setRefreshError(failure); else setError(failure);
    }).finally(() => { if (!controller.signal.aborted) { setLoading(false); setFetching(false); } });
    return () => controller.abort();
  }, [attempt]);
  return <Stack gap="lg">
    <Group justify="space-between" align="flex-start"><div><Title order={1}>Customers</Title><Text c="dimmed">Active and inactive customers.</Text></div><Group><Button variant="default" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>{fetching && !loading ? 'Refreshing customers…' : 'Refresh customers'}</Button><Button onClick={() => setAction({ kind: 'create' })}>Add customer</Button></Group></Group>
    {notice && <Alert color="teal" title="Success" role="status">{notice}</Alert>}
    {refreshError && <Alert color="orange" title="Customer refresh failed" role="alert"><CustomerErrorDetails error={refreshError} /><Text size="sm">Any successful save or deletion above remains successful. Showing the last known customer list.</Text><Button mt="sm" variant="light" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>Retry refresh</Button></Alert>}
    {action && <CustomerDialog action={action} onClose={() => setAction(undefined)} onSaved={saved} onDeleted={deleted} />}
    {loading ? <Center py="xl"><Stack align="center"><Loader /><Text role="status">Loading customers…</Text></Stack></Center>
      : error ? <Alert color="red" title="Unable to load customers" role="alert"><Stack gap="sm"><CustomerErrorDetails error={error} /><Button variant="light" color="red" onClick={() => setAttempt(value => value + 1)} style={{ alignSelf: 'flex-start' }}>Retry</Button></Stack></Alert>
        : customers.length === 0 ? <Card withBorder p="xl"><Title order={2} size="h3">No customers yet</Title><Text c="dimmed">The backend returned an empty customer list.</Text></Card>
          : <><Text size="sm" c="dimmed">{customers.length} {customers.length === 1 ? 'customer' : 'customers'}</Text><SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {customers.map(customer => <Card key={customer.id} withBorder padding="md" radius="md" component="article"><Stack gap="xs"><Title order={2} size="h4" style={{ overflowWrap: 'anywhere' }}>{customer.name}</Title><Text style={{ overflowWrap: 'anywhere' }}>{customer.email}</Text><Badge color={customer.active ? 'teal' : 'gray'} variant="light">{customer.active ? 'Active' : 'Inactive'}</Badge><Group gap="xs"><Button size="xs" variant="light" onClick={() => setAction({ kind: 'edit', customer })}>Edit {customer.name}</Button>{customer.active && <Button size="xs" color="orange" variant="light" onClick={() => setAction({ kind: 'deactivate', customer })}>Deactivate {customer.name}</Button>}<Button size="xs" color="red" variant="light" onClick={() => setAction({ kind: 'delete', customer })}>Delete {customer.name}</Button></Group></Stack></Card>)}
          </SimpleGrid></>}
  </Stack>;
}
