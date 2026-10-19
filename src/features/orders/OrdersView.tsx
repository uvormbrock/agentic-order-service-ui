import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { listOrders, type Order } from './api';
import { NewOrderDialog } from './NewOrderDialog';
import { OrderDetailsDialog } from './OrderDetailsDialog';
import { money, OrderErrorDetails } from './presentation';
export function OrdersView() {
  const [orders, setOrders] = useState<Order[]>([]);
  const hasOrders = useRef(false);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<Error>();
  const [refreshError, setRefreshError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [created, setCreated] = useState<Order>();
  function saved(order: Order) {
    hasOrders.current = true;
    setOrders(current => current.some(item => item.id === order.id) ? current.map(item => item.id === order.id ? order : item) : [...current, order]);
    setCreated(order); setAttempt(value => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(!hasOrders.current); setFetching(true); setError(undefined); setRefreshError(undefined);
    listOrders(controller.signal).then(result => { if (!controller.signal.aborted) { hasOrders.current = true; setOrders(result); } }).catch(reason => {
      if (controller.signal.aborted) return;
      const failure = reason instanceof Error ? reason : new Error('Unable to load orders.');
      if (hasOrders.current) setRefreshError(failure); else setError(failure);
    }).finally(() => { if (!controller.signal.aborted) { setLoading(false); setFetching(false); } });
    return () => controller.abort();
  }, [attempt]);
  return <Stack gap="lg"><Group justify="space-between"><div><Title order={1}>Orders</Title><Text c="dimmed">Stored order amounts and current customer details.</Text></div><Group><Button variant="default" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>{fetching && !loading ? 'Refreshing orders…' : 'Refresh orders'}</Button><Button onClick={() => setCreating(true)}>New order</Button></Group></Group>
    {created && <Alert color="teal" title="Order created successfully" role="status"><Text style={{ overflowWrap: 'anywhere' }}>Order ID: {created.id}</Text><Button variant="light" mt="sm" onClick={() => setDetailId(created.id)}>Inspect created order</Button></Alert>}
    {refreshError && <Alert color="orange" title="Order refresh failed" role="alert"><OrderErrorDetails error={refreshError} /><Text size="sm">Any confirmed order creation remains successful. Showing the last known orders.</Text><Button variant="light" mt="sm" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>Retry refresh</Button></Alert>}
    {creating && <NewOrderDialog onClose={() => setCreating(false)} onSaved={saved} />}
    {detailId && <OrderDetailsDialog id={detailId} onClose={() => setDetailId(undefined)} />}
    {loading ? <Center py="xl"><Stack align="center"><Loader /><Text role="status">Loading orders…</Text></Stack></Center> : error ? <Alert color="red" title="Unable to load orders" role="alert"><OrderErrorDetails error={error} /><Button variant="light" mt="sm" onClick={() => setAttempt(value => value + 1)}>Retry</Button></Alert> : orders.length === 0 ? <Card withBorder p="xl"><Title order={2} size="h3">No orders yet</Title><Text c="dimmed">The backend returned an empty order list.</Text></Card> : <><Text size="sm" c="dimmed">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</Text><SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{orders.map(order => <Card key={order.id} component="article" withBorder><Stack gap="xs"><Title order={2} size="h4" style={{ overflowWrap: 'anywhere' }}>{order.id}</Title><Text>Customer: {order.customer.name}</Text><Text>Items: {order.items.length}</Text><Text>Subtotal: {money(order.subtotal, order.currency)}</Text><Text>Discount: {money(order.discount, order.currency)}</Text><Text fw={700}>Total: {money(order.total, order.currency)}</Text><Text>Currency: {order.currency}</Text><Button variant="light" onClick={() => setDetailId(order.id)}>View order {order.id}</Button></Stack></Card>)}</SimpleGrid></>}
  </Stack>;
}
