import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Group, Loader, Modal, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { listCustomers, type Customer } from '../customers/api';
import { listProducts, type Product } from '../products/api';
import { ApiRequestError } from '../../shared/api/client';
import { createOrder, type CreateOrder, type Order } from './api';
import { OrderErrorDetails } from './presentation';
export type OrderDraftRow = { rowId: number; productId: string; quantity: string };
export function validateOrderDraft(customerId: string, rows: OrderDraftRow[], customers: Customer[], products: Product[]): CreateOrder {
  if (!customers.some(customer => customer.id === customerId && customer.active)) throw new Error('Choose an active customer.');
  if (!rows.length) throw new Error('Add at least one product.');
  const seen = new Set<string>();
  const items = rows.map(row => {
    if (!products.some(product => product.id === row.productId && product.active)) throw new Error('Choose an active product for each item.');
    if (seen.has(row.productId)) throw new Error('Each product can appear only once.');
    seen.add(row.productId);
    if (!/^\d+$/.test(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 10000) throw new Error('Quantity must be a whole number from 1 to 10000.');
    return { productId: row.productId, quantity: Number(row.quantity) };
  });
  return { customerId, items };
}
export function NewOrderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (order: Order) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [choicesError, setChoicesError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState<OrderDraftRow[]>([{ rowId: 1, productId: '', quantity: '1' }]);
  const nextRow = useRef(2);
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setChoicesError(undefined);
    Promise.all([listCustomers(controller.signal), listProducts(controller.signal)]).then(([customerList, productList]) => {
      if (controller.signal.aborted) return;
      setCustomers(customerList.filter(customer => customer.active)); setProducts(productList.filter(product => product.active));
    }).catch(reason => { if (!controller.signal.aborted) setChoicesError(reason instanceof Error ? reason : new Error('Unable to load choices.')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function changeRow(rowId: number, field: 'productId' | 'quantity', value: string) { setRows(current => current.map(row => row.rowId === rowId ? { ...row, [field]: value } : row)); }
  async function submit() {
    if (guard.current || loading || choicesError) return;
    setError(undefined); setUncertain(false);
    let body: CreateOrder;
    try { body = validateOrderDraft(customerId, rows, customers, products); } catch (reason) { setError(reason as Error); return; }
    guard.current = true; setPending(true);
    try { const order = await createOrder(body); onSaved(order); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error('Unable to create order.')); setUncertain(!(reason instanceof ApiRequestError) || reason.status === undefined || reason.status === 500); }
    finally { guard.current = false; setPending(false); }
  }
  const unavailable = !customers.length || !products.length;
  return <Modal opened title="New order" onClose={() => { if (!guard.current) onClose(); }} closeOnClickOutside={!pending} closeOnEscape={!pending} withCloseButton={!pending} size="lg"><form onSubmit={event => { event.preventDefault(); void submit(); }}><Stack>
    <Text size="sm">Select active customers and products. The server calculates all prices, discounts and totals.</Text>
    {loading && <><Loader /><Text role="status">Loading order choices…</Text></>}
    {choicesError && <Alert title="Unable to load order choices" color="red" role="alert"><OrderErrorDetails error={choicesError} /></Alert>}
    {!loading && !choicesError && unavailable && <Alert title="No active choices">{!customers.length && <Text>No active customers available.</Text>}{!products.length && <Text>No active products available.</Text>}</Alert>}
    <Button variant="light" disabled={pending || loading} onClick={() => setAttempt(value => value + 1)}>Reload choices</Button>
    <NativeSelect label="Customer" value={customerId} onChange={event => setCustomerId(event.currentTarget.value)} disabled={pending || loading || !!choicesError} data={[{ value: '', label: 'Choose customer' }, ...customers.map(customer => ({ value: customer.id, label: `${customer.name} (${customer.email})` }))]} />
    {rows.map((row, index) => <Card key={row.rowId} withBorder><Stack gap="sm"><NativeSelect label={`Product ${index + 1}`} value={row.productId} onChange={event => changeRow(row.rowId, 'productId', event.currentTarget.value)} disabled={pending || loading || !!choicesError} data={[{ value: '', label: 'Choose product' }, ...products.filter(product => product.id === row.productId || !rows.some(other => other.productId === product.id)).map(product => ({ value: product.id, label: product.name }))]} /><TextInput label={`Quantity ${index + 1}`} inputMode="numeric" value={row.quantity} onChange={event => changeRow(row.rowId, 'quantity', event.currentTarget.value)} disabled={pending || loading} /><Button variant="subtle" color="red" disabled={pending} onClick={() => setRows(current => current.filter(item => item.rowId !== row.rowId))}>Remove item {index + 1}</Button></Stack></Card>)}
    <Button variant="light" disabled={pending || loading || rows.length >= products.length} onClick={() => { const rowId = nextRow.current++; setRows(current => [...current, { rowId, productId: '', quantity: '1' }]); }}>Add item</Button>
    {error && <Alert color="red" title="Order not confirmed" role="alert"><OrderErrorDetails error={error} />{uncertain && <Text mt="sm" size="sm">The outcome is uncertain; the order may have completed. Check Orders before retrying to avoid creating a duplicate. Your draft has been retained.</Text>}</Alert>}
    <Group justify="flex-end"><Button variant="default" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" loading={pending} disabled={pending || loading || !!choicesError || unavailable}>Create order</Button></Group>
  </Stack></form></Modal>;
}
