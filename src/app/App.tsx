import { useRef, useState } from 'react';
import { AppShell, Button, Container, Group, Text } from '@mantine/core';
import { ProductsView } from '../features/products/ProductsView';
import { CustomersView } from '../features/customers/CustomersView';
import { OrdersView } from '../features/orders/OrdersView';
import { CustomerShopping } from '../features/shopping/CustomerShopping';

export function App() {
  const [mode, setMode] = useState<'admin' | 'customer'>('admin');
  const [shoppingVisited, setShoppingVisited] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const pendingGuard = useRef(false);
  function shoppingPending(value: boolean) { pendingGuard.current = value; setCheckoutPending(value); }
  const [view, setView] = useState<'products' | 'customers' | 'orders'>('products');
  const [customersVisited, setCustomersVisited] = useState(false);
  const [ordersVisited, setOrdersVisited] = useState(false);
  return <AppShell header={{ height: 130 }} padding="md">
    <AppShell.Header><Group h="100%" px="lg" justify="space-between"><Text fw={700}>Order Service</Text><Group aria-label="Application mode"><Button aria-pressed={mode === 'admin'} disabled={checkoutPending} onClick={() => { if (!pendingGuard.current) setMode('admin'); }}>Admin</Button><Button aria-pressed={mode === 'customer'} disabled={checkoutPending} onClick={() => { if (!pendingGuard.current) { setShoppingVisited(true); setMode('customer'); } }}>Customer</Button></Group>{mode === 'admin' && <Group component="nav" aria-label="Administration views" gap="xs"><Button variant={view === 'products' ? 'filled' : 'subtle'} aria-pressed={view === 'products'} onClick={() => setView('products')}>Products</Button><Button variant={view === 'customers' ? 'filled' : 'subtle'} aria-pressed={view === 'customers'} onClick={() => { setCustomersVisited(true); setView('customers'); }}>Customers</Button><Button variant={view === 'orders' ? 'filled' : 'subtle'} aria-pressed={view === 'orders'} onClick={() => { setOrdersVisited(true); setView('orders'); }}>Orders</Button></Group>}</Group></AppShell.Header>
    <AppShell.Main><Container size="xl" py="lg"><div hidden={mode !== 'admin'}><section hidden={view !== 'products'} aria-label="Product catalog"><ProductsView /></section>{customersVisited && <section hidden={view !== 'customers'} aria-label="Customer management"><CustomersView /></section>}{ordersVisited && <section hidden={view !== 'orders'} aria-label="Order management"><OrdersView /></section>}</div>{shoppingVisited && <section hidden={mode !== 'customer'} aria-label="Customer shopping"><CustomerShopping onPending={shoppingPending} /></section>}</Container></AppShell.Main>
  </AppShell>;
}
