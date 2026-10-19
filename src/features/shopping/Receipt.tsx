import { Card, Stack, Text } from '@mantine/core';
import type { Order } from '../orders/api';
import { money } from '../orders/presentation';
export function Receipt({ order }: { order: Order }) {
  return <Card withBorder><Stack gap="xs"><Text fw={700}>Order {order.id}</Text><Text>Customer: {order.customer.name}</Text>{order.items.map((item, index) => <div key={`${item.productId}-${index}`}><Text>{item.productName}</Text><Text>Unit price: {money(item.unitPrice, order.currency)} · Quantity: {item.quantity} · Line total: {money(item.lineTotal, order.currency)}</Text></div>)}<Text>Subtotal: {money(order.subtotal, order.currency)}</Text><Text>Discount: {money(order.discount, order.currency)}</Text><Text fw={700}>Total: {money(order.total, order.currency)}</Text><Text>Currency: {order.currency}</Text></Stack></Card>;
}
