import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Group, Loader, NativeSelect, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { listCustomers, type Customer } from '../customers/api';
import { listProducts, type Product } from '../products/api';
import { ProductThumbnail } from '../products/ProductThumbnail';
import type { Order } from '../orders/api';
import { money, OrderErrorDetails } from '../orders/presentation';
import { ShoppingCart, validQuantity, type CartLine } from './ShoppingCart';
import { CheckoutDialog } from './CheckoutDialog';
import { MyOrders } from './MyOrders';
import { Receipt } from './Receipt';
type Confirmation = { customer: Customer; lines: CartLine[]; products: Product[] };
export function CustomerShopping({ onPending }: { onPending: (pending: boolean) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartError, setCartError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [receipt, setReceipt] = useState<Order>();
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingGuard = useRef(false);
  const customer = customers.find(item => item.id === customerId && item.active);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined); setConfirmation(undefined);
    Promise.all([listCustomers(controller.signal), listProducts(controller.signal)]).then(([customerList, productList]) => { if (!controller.signal.aborted) { setCustomers(customerList.filter(item => item.active)); setProducts(productList.filter(item => item.active)); } }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error('Unable to load shopping choices.')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function changeCustomer(id: string) { if (pendingGuard.current) return; setCustomerId(id); setLines([]); setConfirmation(undefined); setReceipt(undefined); setCartError(''); setRevision(0); }
  function add(product: Product) {
    if (pendingGuard.current) return;
    setCartError('');
    const existing = lines.find(line => line.productId === product.id);
    if (existing && (!validQuantity(existing.quantity) || Number(existing.quantity) >= 10000)) { setCartError('Correct the existing quantity before adding more; the maximum is 10000.'); return; }
    setLines(current => existing ? current.map(line => line.productId === product.id ? { ...line, quantity: String(Number(line.quantity) + 1) } : line) : [...current, { productId: product.id, quantity: '1' }]);
  }
  function saved(order: Order) { setReceipt(order); setLines([]); setCartError(''); setRevision(value => value + 1); }
  function setWritePending(value: boolean) { pendingGuard.current = value; setPending(value); onPending(value); }
  const blocked = pending || loading || !!error || !customer;
  return <Stack><Title order={1}>Customer shopping</Title><Alert title="Local customer demo">Admin and Customer modes are presentation only. Selecting a customer does not verify identity or provide authentication, authorization or privacy.</Alert><Button variant="light" disabled={pending || loading} onClick={() => setAttempt(value => value + 1)}>Refresh shopping choices</Button>{loading && <><Loader /><Text role="status">Loading shopping choices…</Text></>}{error && <Alert color="red" title="Unable to load shopping choices" role="alert"><OrderErrorDetails error={error} /></Alert>}
    <NativeSelect label="Shopping customer" value={customerId} disabled={pending || loading || !!error} onChange={event => changeCustomer(event.currentTarget.value)} data={[{ value: '', label: customerId && !customer ? 'Selected customer unavailable — choose another' : 'Choose active customer' }, ...customers.map(item => ({ value: item.id, label: `${item.name} (${item.email})` }))]} />
    {!loading && !error && !customers.length && <Text>No active customers available.</Text>}{customerId && !customer && <Alert color="orange">Selected customer is no longer active or available. Choose another customer; checkout is blocked.</Alert>}
    <Title order={2}>Shop products</Title>{!loading && !error && !products.length && <Text>No active products available.</Text>}<SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{products.map(product => <Card key={product.id} withBorder><ProductThumbnail id={product.id} name={product.name} /><Stack gap="sm" mt="sm"><Text fw={600}>{product.name}</Text><Text>Estimated catalog price: {money(product.price, 'EUR')}</Text><Button disabled={blocked} onClick={() => add(product)}>Add {product.name} to cart</Button></Stack></Card>)}</SimpleGrid>
    {cartError && <Alert color="red" role="alert">{cartError}</Alert>}<ShoppingCart lines={lines} products={products} disabled={blocked} onChange={(id, quantity) => { if (!pendingGuard.current) setLines(current => current.map(line => line.productId === id ? { ...line, quantity } : line)); }} onRemove={id => { if (!pendingGuard.current) setLines(current => current.filter(line => line.productId !== id)); }} onCheckout={() => { if (!blocked && customer) setConfirmation({ customer: { ...customer }, lines: lines.map(line => ({ ...line })), products: [...products] }); }} />
    {confirmation && <CheckoutDialog customer={confirmation.customer} lines={confirmation.lines} products={confirmation.products} onClose={() => setConfirmation(undefined)} onPending={setWritePending} onSaved={saved} />}
    {receipt && receipt.customerId === customerId && <Stack><Alert color="teal" title="Order confirmed" role="status">The cart was cleared after a confirmed server response. These are the authoritative server amounts.</Alert><Receipt order={receipt} /></Stack>}
    {customerId && <MyOrders key={customerId} customerId={customerId} revision={revision} receipt={receipt} />}
  </Stack>;
}
