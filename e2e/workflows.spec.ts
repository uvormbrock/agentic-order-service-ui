import type { Locator, Page } from '@playwright/test';
import { test, expect, products, customers, newId, orderId, makeOrder, png, replacementPng } from './workflow-fixtures';

const button = (scope: Page | Locator, name: string) => scope.getByRole('button', { name, exact: true });
const card = (page: Page, name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
async function customersView(page: Page) { await page.goto('/'); await button(page, 'Customers').click(); }
async function shop(page: Page) {
  await page.goto('/'); await button(page, 'Customer').click();
  await page.getByLabel('Shopping customer', { exact: true }).selectOption(customers[0].id);
}
async function cart(page: Page) {
  await shop(page);
  await button(page, `Add ${products[0].name} to cart`).click();
  await page.getByLabel(`Quantity for ${products[0].name}`, { exact: true }).fill('2');
  await button(page, `Add ${products[1].name} to cart`).click();
}
async function checkout(page: Page) { await button(page, 'Checkout').click(); return page.getByRole('dialog', { name: 'Confirm checkout', exact: true }); }
async function loadedImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

test('product creation and editing survive catalog refresh with normalized values', async ({ page, model }) => {
  await page.goto('/'); await button(page, 'Add product').click();
  let dialog = page.getByRole('dialog', { name: 'Create product', exact: true });
  await dialog.getByLabel('Product name', { exact: true }).fill('  Browser Espresso  ');
  await dialog.getByLabel('Price (EUR)', { exact: true }).fill('9.75');
  await button(dialog, 'Save product').click(); await expect(dialog).toBeHidden();
  await expect(card(page, 'Browser Espresso')).toContainText('€9.75');
  await button(page, 'Refresh catalog').click(); await expect(card(page, 'Browser Espresso')).toBeVisible();
  await button(page, 'Edit Browser Espresso').click(); dialog = page.getByRole('dialog', { name: 'Edit product', exact: true });
  await dialog.getByLabel('Product name', { exact: true }).fill('Updated Espresso');
  await dialog.getByLabel('Price (EUR)', { exact: true }).fill('11.25');
  await button(dialog, 'Save product').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh catalog').click(); await expect(card(page, 'Updated Espresso')).toContainText('€11.25');
  await expect(card(page, 'Browser Espresso')).toHaveCount(0);
  expect(model.writes.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
    { method: 'POST', path: '/products', body: { name: 'Browser Espresso', price: 9.75 } },
    { method: 'PUT', path: `/products/${newId}`, body: { name: 'Updated Espresso', price: 11.25 } },
  ]);
});

test('product deactivation requires confirmation and remains inactive after refresh', async ({ page, model }) => {
  await page.goto('/'); await button(page, `Deactivate ${products[0].name}`).click();
  const dialog = page.getByRole('dialog', { name: 'Deactivate product', exact: true });
  await expect(dialog).toContainText(`Deactivate “${products[0].name}”?`); expect(model.writes).toHaveLength(0);
  await button(dialog, 'Confirm deactivation').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh catalog').click(); await expect(card(page, products[0].name).getByText('Inactive', { exact: true })).toBeVisible();
  await expect(button(page, `Deactivate ${products[0].name}`)).toHaveCount(0);
  expect(model.writes.map(write => write.body)).toEqual([{ active: false }]);
  expect(model.writes[0].method).toBe('PATCH');
});

test('image upload and replacement refresh the dedicated binary thumbnail', async ({ page, model }) => {
  await page.goto('/'); const product = products[1]; const article = card(page, product.name);
  await expect(article.getByText('No image', { exact: true })).toBeVisible();
  for (const [index, filename] of ['first.png', 'replacement.png'].entries()) {
    const before = model.reads.filter(path => path === `/products/${product.id}/image/thumbnail`).length;
    await button(page, `Upload image for ${product.name}`).click();
    const dialog = page.getByRole('dialog', { name: 'Upload or replace image', exact: true });
    await dialog.locator('input[type=file]').setInputFiles({ name: filename, mimeType: 'image/png', buffer: index === 0 ? png : replacementPng });
    await button(dialog, 'Upload image').click(); await expect(dialog).toBeHidden();
    const image = article.getByRole('img', { name: `${product.name} thumbnail`, exact: true });
    await loadedImage(image);
    await expect.poll(() => image.evaluate(node => [(node as HTMLImageElement).naturalWidth, (node as HTMLImageElement).naturalHeight])).toEqual([index + 1, 1]);
    expect(model.reads.filter(path => path === `/products/${product.id}/image/thumbnail`).length).toBeGreaterThan(before);
  }
  expect(model.writes).toHaveLength(2);
  for (const [index, write] of model.writes.entries()) {
    expect(write.method).toBe('PUT'); expect(write.path).toBe(`/products/${product.id}/image`);
    expect(write.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(write.raw).toContain('name="file"'); expect(write.raw).toContain(index === 0 ? 'first.png' : 'replacement.png');
  }
});

test('customer creation and editing survive refresh', async ({ page, model }) => {
  await customersView(page); await button(page, 'Add customer').click();
  let dialog = page.getByRole('dialog', { name: 'Create customer', exact: true });
  await dialog.getByLabel('Customer name', { exact: true }).fill(' Browser Carol ');
  await dialog.getByLabel('Email', { exact: true }).fill(' CAROL@EXAMPLE.INVALID ');
  await button(dialog, 'Save customer').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh customers').click(); await expect(card(page, 'Browser Carol')).toContainText('carol@example.invalid');
  await button(page, 'Edit Browser Carol').click(); dialog = page.getByRole('dialog', { name: 'Edit customer', exact: true });
  await dialog.getByLabel('Customer name', { exact: true }).fill('Updated Carol');
  await dialog.getByLabel('Email', { exact: true }).fill('updated@example.invalid');
  await button(dialog, 'Save customer').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh customers').click(); await expect(card(page, 'Updated Carol')).toContainText('updated@example.invalid');
  await expect(card(page, 'Browser Carol')).toHaveCount(0);
  expect(model.writes.map(write => ({ method: write.method, body: write.body }))).toEqual([
    { method: 'POST', body: { name: 'Browser Carol', email: 'carol@example.invalid' } },
    { method: 'PUT', body: { name: 'Updated Carol', email: 'updated@example.invalid' } },
  ]);
});

test('confirmed customer deactivation and unreferenced deletion update the list', async ({ page, model }) => {
  await customersView(page); await button(page, `Deactivate ${customers[0].name}`).click();
  let dialog = page.getByRole('dialog', { name: 'Deactivate customer', exact: true });
  await expect(dialog).toContainText(`Deactivate “${customers[0].name}”?`); expect(model.writes).toHaveLength(0);
  await button(dialog, 'Confirm deactivation').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh customers').click(); await expect(card(page, customers[0].name).getByText('Inactive', { exact: true })).toBeVisible();
  await button(page, `Delete ${customers[1].name}`).click(); dialog = page.getByRole('dialog', { name: 'Delete customer', exact: true });
  await expect(dialog).toContainText(`Permanently delete “${customers[1].name}”`); expect(model.writes).toHaveLength(1);
  await button(dialog, 'Confirm deletion').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh customers').click(); await expect(card(page, customers[1].name)).toHaveCount(0);
  expect(model.writes.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
    { method: 'PATCH', path: `/customers/${customers[0].id}`, body: { active: false } },
    { method: 'DELETE', path: `/customers/${customers[1].id}`, body: undefined },
  ]);
});

test('409 customer deletion displays server details and retains the active customer without fallback writes', async ({ page, model }) => {
  model.deletionBlocked = true; await customersView(page); await button(page, `Delete ${customers[0].name}`).click();
  const dialog = page.getByRole('dialog', { name: 'Delete customer', exact: true });
  await button(dialog, 'Confirm deletion').click();
  await expect(dialog.getByRole('alert')).toContainText('CUSTOMER_HAS_ORDERS');
  await expect(dialog.getByRole('alert')).toContainText('Existing orders prevent deletion.');
  await expect(dialog).toContainText('no deactivation was attempted');
  await button(dialog, 'Cancel').click(); await button(page, 'Refresh customers').click();
  await expect(card(page, customers[0].name).getByText('Active', { exact: true })).toBeVisible();
  expect(model.writes.map(write => write.method)).toEqual(['DELETE']);
});

test('admin creates a multi-item order and inspects historical names and authoritative amounts', async ({ page, model }) => {
  await page.goto('/'); await button(page, 'Orders').click(); await expect(page.getByRole('heading', { name: 'No orders yet', exact: true })).toBeVisible();
  await button(page, 'New order').click(); const dialog = page.getByRole('dialog', { name: 'New order', exact: true });
  await dialog.getByLabel('Customer', { exact: true }).selectOption(customers[0].id);
  await expect(dialog.getByLabel('Customer', { exact: true }).getByRole('option', { name: /Inactive Bob/ })).toHaveCount(0);
  await dialog.getByLabel('Product 1', { exact: true }).selectOption(products[0].id);
  await expect(dialog.getByLabel('Product 1', { exact: true }).getByRole('option', { name: products[2].name })).toHaveCount(0);
  await dialog.getByLabel('Quantity 1', { exact: true }).fill('2'); await button(dialog, 'Add item').click();
  await dialog.getByLabel('Product 2', { exact: true }).selectOption(products[1].id);
  await button(dialog, 'Create order').click(); await expect(dialog).toBeHidden();
  await button(page, 'Refresh orders').click(); await expect(card(page, orderId)).toContainText('Total: €36.00');
  expect(model.writes.map(write => write.body)).toEqual([{ customerId: customers[0].id, items: [{ productId: products[0].id, quantity: 2 }, { productId: products[1].id, quantity: 1 }] }]);
  await button(page, `View order ${orderId}`).click(); const details = page.getByRole('dialog', { name: 'Order details', exact: true });
  await expect(details).toContainText('Historical coffee'); await expect(details).toContainText('Historical tea');
  await expect(details.getByText('Unit price: €15.00', { exact: true })).toBeVisible();
  for (const amount of ['Subtotal: €43.00', 'Discount: €7.00', 'Total: €36.00']) await expect(details.getByText(amount, { exact: true })).toBeVisible();
  expect(model.reads).toContain(`/orders/${orderId}`);
});

test('shopping edits a multi-product cart, checks out and shows only the selected customer history with thumbnails', async ({ page, model }) => {
  const other = { ...customers[1], active: true }; model.customers[1] = other;
  const otherId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; model.orders.push(makeOrder(other, otherId));
  model.images.add(products[1].id);
  await cart(page); await page.getByLabel(`Quantity for ${products[1].name}`, { exact: true }).fill('3');
  await expect(page.getByText('Estimated subtotal: €37.00', { exact: true })).toBeVisible();
  await button(page, `Remove ${products[1].name}`).click(); await expect(page.getByLabel(`Quantity for ${products[1].name}`, { exact: true })).toHaveCount(0);
  await button(page, `Add ${products[1].name} to cart`).click();
  const dialog = await checkout(page); await expect(dialog).toContainText(`${products[0].name} · Quantity: 2`);
  await button(dialog, 'Confirm order').click(); await expect(dialog).toBeHidden();
  await expect(page.getByText('Order confirmed', { exact: true })).toBeVisible(); await expect(page.getByText('Your cart is empty.', { exact: true })).toBeVisible();
  await expect(page.getByText(`Order ${orderId}`, { exact: true })).toHaveCount(2);
  for (const name of ['Historical coffee', 'Historical tea']) {
    const images = page.getByRole('img', { name: `${name} thumbnail`, exact: true }); await expect(images).toHaveCount(2);
    await loadedImage(images.nth(0)); await loadedImage(images.nth(1));
  }
  await expect(page.getByText('Total: €36.00', { exact: true })).toHaveCount(2);
  await expect(page.getByText(`Order ${otherId}`, { exact: true })).toHaveCount(0);
  expect(model.writes.map(write => write.body)).toEqual([{ customerId: customers[0].id, items: [{ productId: products[0].id, quantity: 2 }, { productId: products[1].id, quantity: 1 }] }]);
  await page.getByLabel('Shopping customer', { exact: true }).selectOption(other.id);
  await expect(page.getByText(`Order ${otherId}`, { exact: true })).toBeVisible(); await expect(page.getByText(`Order ${orderId}`, { exact: true })).toHaveCount(0);
});

test('pending checkout blocks duplicate submission and uncertain response preserves the draft without replay', async ({ page, model }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  model.orderHandler = async route => { await gate; await route.fulfill({ status: 500, json: { code: 'INTERNAL_SERVER_ERROR', message: 'Confirmation unavailable.' } }); };
  await cart(page); let dialog = await checkout(page); const confirm = button(dialog, 'Confirm order');
  await confirm.click(); await expect(confirm).toBeDisabled(); await expect(button(dialog, 'Cancel')).toBeDisabled();
  await expect.poll(() => model.writes.length).toBe(1);
  // Real keyboard input targets the pending button; disabled controls must not submit again.
  await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  expect(model.writes).toHaveLength(1); release();
  await expect(dialog.getByRole('alert')).toContainText('Confirmation unavailable.');
  await expect(dialog.getByRole('alert')).toContainText('INTERNAL_SERVER_ERROR');
  await expect(dialog).toContainText('Your cart and draft have been retained.');
  await button(dialog, 'Cancel').click();
  await expect(page.getByLabel(`Quantity for ${products[0].name}`, { exact: true })).toHaveValue('2');
  await expect(page.getByLabel(`Quantity for ${products[1].name}`, { exact: true })).toHaveValue('1');
  await button(page, 'Refresh My Orders').click(); await expect(page.getByText('No orders for this customer.', { exact: true })).toBeVisible();
  dialog = await checkout(page); await expect(dialog).toContainText(`${products[0].name} · Quantity: 2`);
  await button(dialog, 'Cancel').click(); expect(model.writes).toHaveLength(1);
});
