import { Card, Group, Stack, Text } from '@mantine/core';
import type { Order } from '../orders/api';
import { money } from '../orders/presentation';
import { ProductThumbnail } from '../products/ProductThumbnail';
export function Receipt({ order }: { order: Order }) {
  return <Card withBorder><Stack gap="xs"><Text fw={700}>Order {order.id}</Text><Text>Customer: {order.customer.name}</Text><Text size="sm" c="dimmed">Thumbnails show current product images; names and amounts remain historical order snapshots.</Text>{order.items.map((item, index) => <Group key={`${item.productId}-${index}`} align="flex-start" wrap="wrap"><ProductThumbnail id={item.productId} name={item.productName} compact /><Stack gap="xs" style={{ flex: '1 1 180px', minWidth: 0 }}><Text style={{ overflowWrap: 'anywhere' }}>{item.productName}</Text><Text>Unit price: {money(item.unitPrice, order.currency)} · Quantity: {item.quantity} · Line total: {money(item.lineTotal, order.currency)}</Text></Stack></Group>)}<Text>Subtotal: {money(order.subtotal, order.currency)}</Text><Text>Discount: {money(order.discount, order.currency)}</Text><Text fw={700}>Total: {money(order.total, order.currency)}</Text><Text>Currency: {order.currency}</Text></Stack></Card>;
}
