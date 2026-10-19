import { useEffect, useState } from 'react';
import { Alert, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { listOrders, type Order } from '../orders/api';
import { OrderErrorDetails } from '../orders/presentation';
import { Receipt } from './Receipt';
export function MyOrders({ customerId, revision, receipt }: { customerId: string; revision: number; receipt?: Order }) {
  const [result, setResult] = useState<{ customerId: string; orders: Order[] }>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined);
    listOrders(controller.signal).then(orders => { if (!controller.signal.aborted) setResult({ customerId, orders: orders.filter(order => order.customerId === customerId) }); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error('Unable to load orders.')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customerId, revision, attempt]);
  const orders = result?.customerId === customerId ? result.orders : [];
  return <Stack><Title order={2}>My Orders</Title><Text size="sm">Demo view: the full order list is fetched and filtered locally by the selected customer ID. This provides no privacy or access control.</Text><Button variant="light" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Refresh My Orders</Button>{loading && <><Loader /><Text role="status">Loading My Orders…</Text></>}{error && <Alert color="red" title="My Orders refresh failed" role="alert"><OrderErrorDetails error={error} />{receipt && <Text>The confirmed order remains successful; its receipt is shown above.</Text>}</Alert>}{!loading && !error && !orders.length && <Text>No orders for this customer.</Text>}{orders.map(order => <Receipt key={order.id} order={order} />)}</Stack>;
}
