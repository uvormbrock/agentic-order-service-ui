import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { ApiRequestError } from '../../shared/api/client';
import { listProducts, type Product } from './api';
import { ProductThumbnail } from './ProductThumbnail';
import { ProductDialog, ErrorDetails, type ProductAction } from './ProductDialog';

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const hasCatalog = useRef(false);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState<ProductAction>();
  const [notice, setNotice] = useState('');
  const [refreshError, setRefreshError] = useState<Error>();
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [created, setCreated] = useState<Product>();
  function saved(product: Product) {
    hasCatalog.current = true;
    setProducts(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product]);
    if (action?.kind === 'create') setCreated(product);
    setNotice('Product saved successfully.');
    setAttempt(value => value + 1);
  }
  function imageSaved(product: Product) {
    setRevisions(current => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setNotice('Image uploaded successfully. The thumbnail is being refreshed; if its preview fails, the upload still succeeded.');
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(!hasCatalog.current);
    setFetching(true);
    setError(undefined);
    setRefreshError(undefined);
    listProducts(controller.signal).then(result => {
      if (!controller.signal.aborted) { hasCatalog.current = true; setProducts(result); }
    }).catch(reason => {
      if (!controller.signal.aborted) {
        const failure = reason instanceof Error ? reason : new Error('Unable to load products.');
        if (hasCatalog.current) setRefreshError(failure); else setError(failure);
      }
    }).finally(() => { if (!controller.signal.aborted) { setLoading(false); setFetching(false); } });
    return () => controller.abort();
  }, [attempt]);

  return <Stack gap="lg">
    <Group justify="space-between" align="flex-start">
      <div><Title order={1}>Products</Title><Text c="dimmed">Your product catalog, including active and inactive products.</Text></div>
      <Group><Badge variant="light" size="lg">Catalog</Badge><Button variant="default" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>{fetching && !loading ? 'Refreshing catalog…' : 'Refresh catalog'}</Button><Button onClick={() => setAction({ kind: 'create' })}>Add product</Button></Group>
    </Group>
    {notice && <Alert color="teal" title="Success" role="status">{notice}</Alert>}
    {created && <Alert title={`Product created: ${created.name}`}><Text size="sm">Product creation and image upload are separate operations.</Text><Button mt="sm" variant="light" onClick={() => setAction({ kind: 'image', product: created })}>Add image to created product</Button></Alert>}
    {refreshError && <Alert color="orange" title="Catalog refresh failed" role="alert"><ErrorDetails error={refreshError} /><Text size="sm">Any successful save above remains successful. Showing the last known catalog.</Text><Button mt="sm" variant="light" disabled={fetching} onClick={() => setAttempt(value => value + 1)}>Retry refresh</Button></Alert>}
    {action && <ProductDialog action={action} onClose={() => setAction(undefined)} onSaved={saved} onImageSaved={imageSaved} />}
    {loading ? <Center py="xl"><Stack align="center"><Loader /><Text role="status">Loading products…</Text></Stack></Center>
      : error ? <Alert color="red" title="Unable to load product catalog" role="alert">
        <Stack gap="sm"><Text size="sm">{error.message}</Text>
          {error instanceof ApiRequestError && error.code && <Text size="sm">Code: {error.code}</Text>}
          {error instanceof ApiRequestError && error.requestId && <Text size="sm">Request ID: {error.requestId}</Text>}
          <Button variant="light" color="red" onClick={() => setAttempt(value => value + 1)} style={{ alignSelf: 'flex-start' }}>Retry</Button>
        </Stack>
      </Alert>
        : products.length === 0 ? <Card withBorder p="xl"><Title order={2} size="h3">No products yet</Title><Text c="dimmed">The backend returned an empty product catalog.</Text></Card>
          : <><Text size="sm" c="dimmed">{products.length} {products.length === 1 ? 'product' : 'products'}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}>
              {products.map(product => <Card key={product.id} withBorder padding="md" radius="md" component="article">
                <ProductThumbnail id={product.id} name={product.name} revision={revisions[product.id] ?? 0} />
                <Stack gap="xs" mt="md"><Title order={2} size="h4" style={{ overflowWrap: 'anywhere' }}>{product.name}</Title>
                  <Group justify="space-between"><Text fw={600}>{euro.format(product.price)}</Text><Badge color={product.active ? 'teal' : 'gray'} variant="light">{product.active ? 'Active' : 'Inactive'}</Badge></Group>
                  <Group gap="xs"><Button size="xs" variant="light" onClick={() => setAction({ kind: 'edit', product })}>Edit {product.name}</Button><Button size="xs" variant="light" onClick={() => setAction({ kind: 'image', product })}>Upload image for {product.name}</Button>{product.active && <Button size="xs" color="red" variant="light" onClick={() => setAction({ kind: 'deactivate', product })}>Deactivate {product.name}</Button>}</Group>
                </Stack>
              </Card>)}
            </SimpleGrid></>}
  </Stack>;
}
