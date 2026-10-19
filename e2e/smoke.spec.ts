import { test, expect, products, customers } from './fixtures';
import type { Page } from '@playwright/test';

async function expectMode(page: Page, active: 'Admin' | 'Customer') {
  const selected = page.getByRole('button', { name: active, exact: true });
  const other = page.getByRole('button', { name: active === 'Admin' ? 'Customer' : 'Admin', exact: true });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveAttribute('data-variant', 'filled');
  await expect(other).toHaveAttribute('data-variant', 'default');
  await expect.poll(async () => {
    const selectedColor = await selected.evaluate(node => getComputedStyle(node).backgroundColor);
    const otherColor = await other.evaluate(node => getComputedStyle(node).backgroundColor);
    return selectedColor !== otherColor && selectedColor !== 'rgba(0, 0, 0, 0)';
  }).toBe(true);
}

test('navigation switches administration views and highlights only the active mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Product catalog', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
  await expectMode(page, 'Admin');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Customer management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Order management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Customer shopping', exact: true })).toBeVisible();
  await expectMode(page, 'Customer');
  await expect(page.getByRole('navigation', { name: 'Administration views' })).toBeHidden();
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expectMode(page, 'Admin');
  await expect(page.getByRole('region', { name: 'Order management' })).toBeVisible();
});

test('product catalog renders thumbnails and editing can be cancelled without writes', async ({ page, traffic }) => {
  await page.goto('/');
  const catalog = page.getByRole('region', { name: 'Product catalog', exact: true });
  await expect(catalog.getByRole('article')).toHaveCount(3);
  for (const product of products) await expect(catalog.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  const image = catalog.getByRole('img', { name: `${products[0].name} thumbnail` });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const missing = catalog.getByRole('article').filter({ has: page.getByRole('heading', { name: products[1].name, exact: true }) });
  await expect(missing.getByText('No image', { exact: true })).toBeVisible();
  await catalog.getByRole('button', { name: `Edit ${products[0].name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue(products[0].name);
  await expect(dialog.getByLabel('Price (EUR)', { exact: true })).toHaveValue('12.50');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(traffic.writes).toEqual([]);
});

test('customer shopping reviews the selected customer and cart then cancels checkout', async ({ page, traffic }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customer', exact: true }).click();
  const shop = page.getByRole('region', { name: 'Customer shopping', exact: true });
  const customerSelect = shop.getByLabel('Shopping customer', { exact: true });
  await expect(customerSelect).toBeEnabled();
  await customerSelect.selectOption(customers[0].id);
  await expect(customerSelect).toHaveValue(customers[0].id);
  await expect(customerSelect.getByRole('option', { name: /Inactive Bob/ })).toHaveCount(0);
  await expect(shop.getByRole('button', { name: `Add ${products[0].name} to cart`, exact: true })).toBeVisible();
  await expect(shop.getByRole('button', { name: `Add ${products[1].name} to cart`, exact: true })).toBeVisible();
  await expect(shop.getByText(products[2].name, { exact: true })).toHaveCount(0);
  await shop.getByRole('button', { name: `Add ${products[0].name} to cart`, exact: true }).click();
  const quantity = shop.getByLabel(`Quantity for ${products[0].name}`, { exact: true });
  await expect(quantity).toHaveValue('1');
  await quantity.fill('3');
  await expect(quantity).toHaveValue('3');
  await expect(shop.getByText('Estimated subtotal: €37.50', { exact: true })).toBeVisible();
  await shop.getByRole('button', { name: 'Checkout', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm checkout', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Customer: ${customers[0].name} (${customers[0].email})`, { exact: true })).toBeVisible();
  await expect(dialog.getByText(`${products[0].name} · Quantity: 3`, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm order', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(quantity).toHaveValue('3');
  expect(traffic.writes.filter(request => request.startsWith('POST '))).toEqual([]);
});
