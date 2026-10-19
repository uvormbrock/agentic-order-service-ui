import { test as base, expect, type Route } from '@playwright/test';
import { products, customers } from './fixtures';
import type { components } from '../src/shared/api/schema';

type Order = components['schemas']['OrderResponse'];
type OrderBody = components['schemas']['CreateOrderRequest'];
export const newId = '44444444-4444-4444-8444-444444444444';
export const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export const replacementPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBEfcD/ePF9e8AAAAASUVORK5CYII=', 'base64');
export function makeOrder(customer = customers[0], id = orderId): Order {
  return { id, customerId: customer.id, customer: { ...customer }, currency: 'EUR', subtotal: 43, discount: 7, total: 36,
    items: [{ productId: products[0].id, productName: 'Historical coffee', unitPrice: 15, quantity: 2, lineTotal: 30 },
      { productId: products[1].id, productName: 'Historical tea', unitPrice: 13, quantity: 1, lineTotal: 13 }] };
}
type Write = { method: string; path: string; body: unknown; contentType: string; raw: string };
type Model = {
  products: components['schemas']['ProductResponse'][];
  customers: components['schemas']['CustomerResponse'][];
  orders: Order[]; writes: Write[]; reads: string[]; images: Set<string>; imageVersions: Map<string, number>;
  deletionBlocked: boolean;
  orderHandler?: (route: Route, body: OrderBody) => Promise<void>;
  productListHandler?: (route: Route) => Promise<void>;
};
export const test = base.extend<{ model: Model }>({
  model: [async ({ page, baseURL }, use) => {
    const model: Model = { products: structuredClone(products), customers: structuredClone(customers), orders: [], writes: [], reads: [], images: new Set([products[0].id]), deletionBlocked: false, imageVersions: new Map() };
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = url.pathname;
      const api = /^\/(products|customers|orders)(?:\/|$)/.test(path);
      const sameOrigin = url.origin === baseURL;
      const fail = async () => { unexpected.push(`${method} ${url.href}`); await route.abort('blockedbyclient'); };
      if (!sameOrigin || (api && url.search) || (!api && ['fetch', 'xhr'].includes(request.resourceType()))) { await fail(); return; }
      if (!api) { if (['GET', 'HEAD'].includes(method)) await route.continue(); else await fail(); return; }
      if (method === 'GET') {
        model.reads.push(path);
        if (path === '/products') { if (model.productListHandler) await model.productListHandler(route); else await route.fulfill({ json: model.products }); return; }
        if (path === '/customers') { await route.fulfill({ json: model.customers }); return; }
        if (path === '/orders') { await route.fulfill({ json: model.orders }); return; }
        const image = model.products.find(product => path === `/products/${product.id}/image/thumbnail`);
        if (image) { await route.fulfill(model.images.has(image.id) ? { contentType: 'image/png', body: (model.imageVersions.get(image.id) ?? 0) >= 2 ? replacementPng : png } : { status: 404, json: { code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'No image exists.' } }); return; }
        const order = model.orders.find(order => path === `/orders/${order.id}`);
        if (order) { await route.fulfill({ json: order }); return; }
        await fail(); return;
      }
      const contentType = request.headers()['content-type'] ?? '';
      const raw = request.postData() ?? '';
      const body: unknown = contentType.includes('application/json') ? request.postDataJSON() : undefined;
      const write = { method, path, body, contentType, raw };
      if (path === '/orders' && method === 'POST') {
        model.writes.push(write);
        if (model.orderHandler) { await model.orderHandler(route, body as OrderBody); return; }
        const order = makeOrder(model.customers.find(customer => customer.id === (body as OrderBody).customerId));
        model.orders.push(order); await route.fulfill({ status: 201, json: order }); return;
      }
      const collection = path.startsWith('/products') ? model.products : path.startsWith('/customers') ? model.customers : undefined;
      const root = path.startsWith('/products') ? '/products' : '/customers';
      if (collection && path === root && method === 'POST') {
        model.writes.push(write);
        const value = root === '/products' ? { id: newId, active: true, ...(body as components['schemas']['ProductDetailsRequest']) } : { id: newId, active: true, ...(body as components['schemas']['CustomerDetailsRequest']) };
        if (root === '/products') model.products.push(value as components['schemas']['ProductResponse']); else model.customers.push(value as components['schemas']['CustomerResponse']);
        await route.fulfill({ status: 201, json: value }); return;
      }
      const entry = collection?.find(item => path === `${root}/${item.id}`);
      if (entry && (method === 'PUT' || method === 'PATCH')) {
        model.writes.push(write); Object.assign(entry, body); await route.fulfill({ json: entry }); return;
      }
      if (entry && root === '/customers' && method === 'DELETE') {
        model.writes.push(write);
        if (model.deletionBlocked) await route.fulfill({ status: 409, json: { code: 'CUSTOMER_HAS_ORDERS', message: 'Existing orders prevent deletion.' } });
        else { model.customers = model.customers.filter(customer => customer.id !== entry.id); await route.fulfill({ status: 204 }); }
        return;
      }
      const upload = model.products.find(product => path === `/products/${product.id}/image`);
      if (upload && method === 'PUT') { model.writes.push(write); model.images.add(upload.id); model.imageVersions.set(upload.id, (model.imageVersions.get(upload.id) ?? 0) + 1); await route.fulfill({ status: 204 }); return; }
      await fail();
    });
    await use(model);
    expect(unexpected, 'Every API call and write must match an explicit isolated fixture').toEqual([]);
  }, { auto: true }],
});
export { expect, products, customers };
