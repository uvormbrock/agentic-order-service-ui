import { useRef, useState } from 'react';
import { Alert, Button, FileInput, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { ApiRequestError } from '../../shared/api/client';
import { createProduct, deactivateProduct, updateProduct, uploadProductImage, type Product, type ProductDetails } from './api';

export type ProductAction = { kind: 'create' } | { kind: 'edit' | 'deactivate' | 'image'; product: Product };
// Match Unicode White_Space, including NEL, rather than JavaScript's broader trim set.
const stripWhitespace = (value: string) => value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
export function validateProductDetails(name: string, price: string): ProductDetails {
  const normalized = stripWhitespace(name);
  if (/\p{Surrogate}/u.test(normalized) || [...normalized].length < 1 || [...normalized].length > 200) throw new Error('Name must contain 1–200 Unicode characters after surrounding whitespace is removed.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(price) || Number(price) > 999999.99) throw new Error('Price must be a decimal from 0 to 999999.99, with up to two decimal places.');
  return { name: normalized, price: Number(price) };
}
export function validateProductImage(file: File | null): File {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a nonempty JPEG or PNG file up to 10 MiB.');
  return file;
}
export function ErrorDetails({ error }: { error: Error }) {
  return <><Text size="sm">{error.message}</Text>{error instanceof ApiRequestError && error.code && <Text size="sm">Code: {error.code}</Text>}{error instanceof ApiRequestError && error.requestId && <Text size="sm">Request ID: {error.requestId}</Text>}</>;
}

export function ProductDialog({ action, onClose, onSaved, onImageSaved }: {
  action: ProductAction; onClose: () => void; onSaved: (product: Product) => void; onImageSaved: (product: Product) => void;
}) {
  const product = action.kind === 'create' ? undefined : action.product;
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? product.price.toFixed(2) : '');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const title = action.kind === 'create' ? 'Create product' : action.kind === 'edit' ? 'Edit product' : action.kind === 'deactivate' ? 'Deactivate product' : 'Upload or replace image';
  async function submit() {
    if (guard.current) return;
    setError(undefined);
    setUncertain(false);
    let details: ProductDetails | undefined;
    let image: File | undefined;
    try {
      if (action.kind === 'create' || action.kind === 'edit') details = validateProductDetails(name, price);
      if (action.kind === 'image') image = validateProductImage(file);
    } catch (reason) { setError(reason as Error); return; }
    guard.current = true;
    setPending(true);
    try {
      if (action.kind === 'image') { await uploadProductImage(action.product.id, image!); onImageSaved(action.product); }
      else {
        const result = action.kind === 'create' ? await createProduct(details!) : action.kind === 'edit' ? await updateProduct(action.product.id, details!) : await deactivateProduct(action.product.id);
        onSaved(result);
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Request failed.'));
      setUncertain(!(reason instanceof ApiRequestError) || reason.status === undefined || reason.status === 500);
    } finally { guard.current = false; setPending(false); }
  }
  return <Modal opened onClose={() => { if (!guard.current) onClose(); }} title={title} closeOnClickOutside={!pending} closeOnEscape={!pending} withCloseButton={!pending}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}><Stack>
      {(action.kind === 'create' || action.kind === 'edit') && <><TextInput label="Product name" value={name} onChange={event => setName(event.currentTarget.value)} disabled={pending} /><TextInput label="Price (EUR)" inputMode="decimal" value={price} onChange={event => setPrice(event.currentTarget.value)} disabled={pending} /></>}
      {action.kind === 'deactivate' && <Text>Deactivate “{product!.name}”? The product remains in the catalog and cannot be reactivated here.</Text>}
      {action.kind === 'image' && <><Text size="sm">Image for “{product!.name}”. Uploading replaces the existing image. The backend checks image content and dimensions.</Text><FileInput label="JPEG or PNG image" accept="image/jpeg,image/png" value={file} onChange={setFile} disabled={pending} /></>}
      {error && <Alert color="red" title="Request unsuccessful" role="alert"><ErrorDetails error={error} />{uncertain && <Text size="sm" mt="sm">The outcome is uncertain; the operation may have completed. Refresh the catalog and check the product or image before retrying. Your input has been retained.</Text>}</Alert>}
      <Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" loading={pending} disabled={pending} color={action.kind === 'deactivate' ? 'red' : undefined}>{action.kind === 'deactivate' ? 'Confirm deactivation' : action.kind === 'image' ? 'Upload image' : 'Save product'}</Button></Group>
    </Stack></form>
  </Modal>;
}
