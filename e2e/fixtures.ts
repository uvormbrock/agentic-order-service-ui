import { test as base, expect } from '@playwright/test';
import type { components, paths } from '../src/shared/api/schema';

export const products = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Smoke Coffee', price: 12.5, active: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Smoke Tea', price: 4, active: true },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Retired Cocoa', price: 8, active: false },
] satisfies paths['/products']['get']['responses'][200]['content']['application/json'];
export const customers = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Smoke Alice', email: 'alice@example.invalid', active: true },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Inactive Bob', email: 'bob@example.invalid', active: false },
] satisfies paths['/customers']['get']['responses'][200]['content']['application/json'];
const orders = [] satisfies paths['/orders']['get']['responses'][200]['content']['application/json'];
const missingImage = {
  code: 'PRODUCT_IMAGE_NOT_FOUND', message: 'The product image was not found.',
} satisfies components['schemas']['ApiError'];
// Valid one-pixel PNG, delivered as binary rather than an invented image JSON field.
const thumbnail = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

type Traffic = { writes: string[]; unexpected: string[] };
export const test = base.extend<{ traffic: Traffic }>({
  traffic: [async ({ page, baseURL }, use) => {
    const traffic: Traffic = { writes: [], unexpected: [] };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const description = `${request.method()} ${url.href}`;
      // Fail closed for every write, including an accidentally changed origin/path.
      if (!['GET', 'HEAD'].includes(request.method())) {
        traffic.writes.push(description);
        await route.abort('blockedbyclient');
        return;
      }
      const sameOrigin = url.origin === baseURL;
      const apiPath = /^\/(products|customers|orders)(?:\/|$)/.test(url.pathname);
      if (sameOrigin && request.method() === 'GET' && !url.search) {
        const json = url.pathname === '/products' ? products : url.pathname === '/customers' ? customers : url.pathname === '/orders' ? orders : undefined;
        if (json) { await route.fulfill({ json }); return; }
        const product = products.find(item => url.pathname === `/products/${item.id}/image/thumbnail`);
        if (product) {
          await route.fulfill(product === products[0]
            ? { status: 200, contentType: 'image/png', body: thumbnail }
            : { status: 404, json: missingImage });
          return;
        }
      }
      if (apiPath || !sameOrigin || ['fetch', 'xhr'].includes(request.resourceType())) {
        traffic.unexpected.push(description);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue(); // Same-origin Vite HTML, modules, styles and fonts only.
    });
    await use(traffic);
    // Keep interception installed until page teardown; never allow an unmatched API call through.
    expect(traffic.writes, 'No browser scenario may issue a write').toEqual([]);
    expect(traffic.unexpected, 'Every API request must match an explicit fixture').toEqual([]);
  }, { auto: true }],
});
export { expect };
