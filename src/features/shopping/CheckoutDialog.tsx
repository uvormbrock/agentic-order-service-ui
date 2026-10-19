import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { Customer } from '../customers/api';
import type { Product } from '../products/api';
import { createOrder, type Order } from '../orders/api';
import { isUncertainWriteError } from '../../shared/api/client';
import { OrderErrorDetails } from '../orders/presentation';
import { validQuantity, type CartLine } from './ShoppingCart';
export function CheckoutDialog({ customer, lines, products, onClose, onPending, onSaved }: {
  customer: Customer;
  lines: CartLine[];
  products: Product[];
  onClose: () => void;
  onPending: (pending: boolean) => void;
  onSaved: (order: Order) => void;
}) {
  const guard = useRef(false);
  const writeController = useRef<AbortController | null>(null);
  const pendingCallback = useRef(onPending);
  pendingCallback.current = onPending;
  useEffect(() => () => {
    writeController.current?.abort();
    if (guard.current)
      pendingCallback.current(false);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  async function submit() {
    if (guard.current)
      return;
    setError(undefined);
    setUncertain(false);
    if (!customer.active ||
      !lines.length ||
      new Set(lines.map(line => line.productId)).size !== lines.length ||
      lines.some(line => !validQuantity(line.quantity) ||
        !products.some(product => product.id === line.productId && product.active))) {
      setError(new Error('The customer, products and quantities must all be valid and active. Refresh choices before checkout.'));
      return;
    }
    const controller = new AbortController();
    writeController.current = controller;
    guard.current = true;
    setPending(true);
    onPending(true);
    try {
      const order = await createOrder({ customerId: customer.id, items: lines.map(line => ({ productId: line.productId, quantity: Number(line.quantity) })) }, controller.signal);
      if (controller.signal.aborted)
        return;
      onSaved(order);
      onClose();
    }
    catch (reason) {
      if (controller.signal.aborted)
        return;
      setError(reason instanceof Error ? reason : new Error('Checkout was not confirmed.'));
      setUncertain(isUncertainWriteError(reason));
    }
    finally {
      guard.current = false;
      if (!controller.signal.aborted) {
        setPending(false);
        onPending(false);
      }
    }
  }
  return <Modal opened title="Confirm checkout" onClose={() => { if (!guard.current) onClose(); }} closeOnClickOutside={!pending} closeOnEscape={!pending} withCloseButton={!pending}>
    <Stack>
      <Text>Customer: {customer.name} ({customer.email})</Text>
      {lines.map(line => <Text key={line.productId}>
        {products.find(product => product.id === line.productId)?.name ?? line.productId} · Quantity: {line.quantity}
      </Text>)}
      <Text size="sm">The server calculates final amounts. Confirm once to create this order.</Text>
      {error && <Alert title="Checkout not confirmed" color="red" role="alert">
        <OrderErrorDetails error={error} />
        {uncertain && <Text mt="sm">The outcome is uncertain; the order may have completed. Check My Orders before retrying to avoid duplicate orders. Your cart and draft have been retained.</Text>}
      </Alert>}
      <Group justify="flex-end">
        <Button variant="default" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button loading={pending} disabled={pending} onClick={() => void submit()}>Confirm order</Button>
      </Group>
    </Stack>
  </Modal>;
}
