# API Discovery

Source: [api/openapi.json](../api/openapi.json). Discovery performed on 2026-10-19. The copied contract contains 8 paths and 18 operations. No business write requests were executed for discovery.

## Supported operations

All `{id}` path parameters are required canonical UUID strings. No pagination, search or filtering query contract is defined.

| Method | Path | Request body | Success response |
|---|---|---|---|
| GET | `/customers` | no body | 200: application/json: CustomerResponse[] |
| POST | `/customers` | application/json: CustomerDetailsRequest | 201: application/json: CustomerResponse |
| DELETE | `/customers/{id}` | no body | 204: no body |
| GET | `/customers/{id}` | no body | 200: application/json: CustomerResponse |
| PATCH | `/customers/{id}` | application/json: DeactivateCustomerRequest | 200: application/json: CustomerResponse |
| PUT | `/customers/{id}` | application/json: CustomerDetailsRequest | 200: application/json: CustomerResponse |
| GET | `/orders` | no body | 200: application/json: OrderResponse[] |
| POST | `/orders` | application/json: CreateOrderRequest | 201: application/json: OrderResponse |
| GET | `/orders/{id}` | no body | 200: application/json: OrderResponse |
| GET | `/products` | no body | 200: application/json: ProductResponse[] |
| POST | `/products` | application/json: ProductDetailsRequest | 201: application/json: ProductResponse |
| GET | `/products/{id}` | no body | 200: application/json: ProductResponse |
| PATCH | `/products/{id}` | application/json: DeactivateProductRequest | 200: application/json: ProductResponse |
| PUT | `/products/{id}` | application/json: ProductDetailsRequest | 200: application/json: ProductResponse |
| DELETE | `/products/{id}/image` | no body | 204: no body |
| GET | `/products/{id}/image` | no body | 200: image/jpeg: binary; image/png: binary |
| PUT | `/products/{id}/image` | multipart/form-data: required binary `file` part | 204: no body |
| GET | `/products/{id}/image/thumbnail` | no body | 200: image/png: binary |

## Request and response models

- **ApiError**: `code: string` (required), `message: string` (required).
- **CreateOrderRequest**: `customerId: string` (required), `items: OrderItemRequest[]` (required).
- **CustomerDetailsRequest**: `email: string` (required), `name: string` (required).
- **CustomerResponse**: `active: boolean` (required), `email: string` (required), `id: string` (required), `name: string` (required).
- **CustomerResult**: `active: boolean` (required), `email: string` (required), `id: string` (required), `name: string` (required).
- **DeactivateCustomerRequest**: `active: boolean` (required).
- **DeactivateProductRequest**: `active: boolean` (required).
- **Item**: `lineTotal: number` (required), `productId: string` (required), `productName: string` (required), `quantity: integer` (required), `unitPrice: number` (required).
- **OrderItemRequest**: `productId: string` (required), `quantity: integer` (required).
- **OrderResponse**: `currency: string` (required), `customer: CustomerResult` (required), `customerId: string` (required), `discount: number` (required), `id: string` (required), `items: Item[]` (required), `subtotal: number` (required), `total: number` (required).
- **ProductDetailsRequest**: `name: string` (required), `price: number` (required).
- **ProductResponse**: `active: boolean` (required), `id: string` (required), `name: string` (required), `price: number` (required).

## Backend-derived feature possibilities

This discovery list records API capabilities, not a checklist of implemented UI features. See the [README](../README.md) for the current application.

- **Products:** list and detail views, create, edit name/price, deactivate. Show active state. No product deletion or reactivation action.
- **Product images:** thumbnail preview with missing-image fallback, original view, JPEG/PNG upload or replacement, image deletion. Create the product first, then upload using its ID; retain the product and offer upload retry if upload fails. Product JSON has no image metadata or image-presence flag.
- **Customers:** list and detail views, create, edit name/email, deactivate, delete. Explain CUSTOMER_HAS_ORDERS/409 when deletion is blocked. No reactivation action.
- **Orders:** list, detail and creation using an active customer and active products with quantities. Show server-returned subtotal, discount, total and currency. Display current customer data and historical product/price snapshots. No update, cancellation or deletion operations.
- **Shared behavior:** loading, empty and error states; display safe ApiError code/message and server X-Request-ID for support. Treat 204 as bodyless. Do not automatically replay writes after an uncertain network/500 outcome.

## Validation and integration constraints

- Names contain 1–200 Unicode code points after stripping surrounding Unicode whitespace. Send only documented request fields.
- Prices are JSON numbers in EUR, 0–999999.99, with at most two decimal places and no exponent notation. Quantity is an integer from 1 to 10000; duplicate product quantities are consolidated with the same limit.
- Email is normalized to stripped lowercase ASCII, at most 254 characters, and unique including inactive customers. Deactivation accepts only `{"active":false}`.
- Images: at most 10 MiB, 40 million pixels, and 16384 pixels per edge. Declared JPEG/PNG media type must match content. Thumbnails are PNG, fit 320×320 and never upscale. Use FormData; let the browser set the multipart boundary. Read binary responses as Blob, not JSON.
- Image writes require deployment opt-in; handle 403 PRODUCT_IMAGE_WRITES_DISABLED. The contract does not provide authentication or an administrator identity.
- API snapshot server URL is relative `/`. A separate frontend origin needs a development proxy or explicitly approved backend CORS configuration. CORS support cannot be inferred from this snapshot; backend configuration was not changed.
- Generated types provide compile-time contracts, not runtime validation. Binary schema strings require a browser adapter for File/FormData/Blob.

## Initial implementation structure

```text
src/
  features/
    products/
    customers/
    orders/
  shared/
    api/
      schema.d.ts  # generated; do not hand edit
```

This structure was proposed during initial discovery. React views, API adapters and the development proxy now exist, with an additional `shopping` feature for the local customer demo. Deployment remains outside this discovery record; see the [README](../README.md) for current setup and limitations.
