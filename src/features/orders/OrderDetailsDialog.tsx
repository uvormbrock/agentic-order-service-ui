import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { getOrder, type Order } from './api';
import { money, OrderErrorDetails } from './presentation';
import { ProductThumbnail } from '../products/ProductThumbnail';
export function OrderDetailsDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setOrder(undefined); setError(undefined); setLoading(true);
    getOrder(id, controller.signal).then(result => { if (!controller.signal.aborted) setOrder(result); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error('Unable to load order.')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, attempt]);
  return <Modal opened onClose={onClose} title="Order details" size="lg"><Stack>
    {loading ? <><Loader /><Text role="status">Loading order details…</Text></> : error ? <Alert color="red" title="Unable to load order" role="alert"><OrderErrorDetails error={error} /><Button mt="sm" onClick={() => setAttempt(value => value + 1)}>Retry details</Button></Alert> : order && <>
      <Text style={{ overflowWrap: 'anywhere' }}>Order ID: {order.id}</Text>
      <Title order={2} size="h4">Current customer</Title><Text>{order.customer.name}</Text><Text>{order.customer.email}</Text><Text style={{ overflowWrap: 'anywhere' }}>Customer ID: {order.customerId}</Text><Badge color={order.customer.active ? 'teal' : 'gray'}>{order.customer.active ? 'Active' : 'Inactive'}</Badge>
      <Title order={2} size="h4">Historical items</Title><Text size="sm" c="dimmed">Names and amounts below are the stored order snapshots. Thumbnails show current product images, not historical image snapshots.</Text>
      {order.items.map((item, index) => <Card key={`${item.productId}-${index}`} withBorder><Group align="flex-start" wrap="wrap"><ProductThumbnail id={item.productId} name={item.productName} compact /><Stack gap="xs" style={{ flex: '1 1 180px', minWidth: 0 }}><Text fw={600}>{item.productName}</Text><Text style={{ overflowWrap: 'anywhere' }}>Product ID: {item.productId}</Text><Text>Unit price: {money(item.unitPrice, order.currency)}</Text><Text>Quantity: {item.quantity}</Text><Text>Line total: {money(item.lineTotal, order.currency)}</Text></Stack></Group></Card>)}
      <Text>Subtotal: {money(order.subtotal, order.currency)}</Text><Text>Discount: {money(order.discount, order.currency)}</Text><Text fw={700}>Total: {money(order.total, order.currency)}</Text><Text>Currency: {order.currency}</Text>
    </>}
  </Stack></Modal>;
}
