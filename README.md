# Agentic Order Service UI

React, TypeScript, Vite and Mantine local administration and customer-shopping demo. The Products catalog uses the existing API for listing, creating, editing and deactivating products, with thumbnail display and image upload or replacement. The Customers view supports listing, creating, editing, deactivating and deleting unreferenced customers. The Orders view supports listing, inspecting and creating orders.

## Run locally

Use a Node.js version supported by the installed Vite version and npm. Start the existing Spring Boot backend separately using its own repository's startup instructions; it should be reachable at `http://127.0.0.1:18080` by default.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set the backend target in `.env.local` if needed, then restart Vite:

```dotenv
BACKEND_URL=http://127.0.0.1:18080
```

`BACKEND_URL` is read only by the Vite server. Do not prefix secrets with `VITE_`: those variables are public browser configuration. There is no runtime backend URL setting.

Open the local URL printed by Vite; Admin mode and the Products catalog open by default. The catalog shows actual product names, EUR prices, active status and thumbnails from the dedicated image endpoint. Missing or failed images show a fallback. Loading, empty-list and API-error states are supported, including a backend connection error when the API is unavailable. Use the navigation to open Customers, which lists names, email addresses and active status for active and inactive customers. Orders opens the order list and individual order details, including server-returned amounts and currency.

The development proxy forwards only the supported product collection, product-by-ID and image API paths, plus customer and order collection/by-ID paths to the fixed configured backend target. It does not accept a target URL from the browser. A production build needs same-origin routing for these API paths at deployment; the Vite development proxy is not included in the built application.

## Local demo modes

The Admin/Customer switch changes presentation only. There is no authentication or role-based access control, and selecting a customer does not verify identity. My Orders downloads the full `GET /orders` response and filters it in the browser by selected customer ID. This is not a privacy boundary or a production-secure customer portal.

## Customer shopping walkthrough

Use disposable, authorized test data for checkout, which creates a real backend order.

1. Switch to Customer and select an active demo customer. Browse active products with thumbnails and EUR catalog prices.
2. Add multiple products to the in-memory cart, change each quantity from 1 to 10000, or remove items. Catalog prices and cart amounts are estimates; there is no cart persistence. Changing customer resets the shopping state.
3. Select Checkout, review Confirm checkout, then select Confirm order once. The request contains only the selected customer ID and product IDs/quantities. The backend receipt supplies authoritative prices, discounts, totals and currency. The cart clears only after a usable HTTP 201 confirmation for the selected customer.
4. Open My Orders to inspect orders matching the selected customer. If checkout returns a network error or HTTP 500 with uncertain completion, the app retains the cart; check orders before retrying; the app never automatically replays checkout. Mode and customer switching are locked while checkout is pending.

## Product walkthrough

Use disposable, authorized test data for actions that change backend data.

1. Open Products and inspect names, EUR prices, active status and thumbnails.
2. Create a product with a name and EUR price. Product creation completes before any image upload.
3. Edit its name or price. Editing an inactive product preserves its inactive status.
4. Upload a JPEG or PNG image, or replace an existing image. Select a file no larger than 10 MiB; the app sends it as the required multipart `file` part. The backend also validates image content and dimensions.
5. Deactivate an active test product and confirm the action. Activation/reactivation and product deletion are unsupported and have no UI actions.

Image writes depend on backend deployment configuration. A `403 PRODUCT_IMAGE_WRITES_DISABLED` response means they are disabled; the frontend does not bypass this restriction. A failed image upload leaves the separately created product intact. Writes are not automatically replayed after an uncertain outcome; inspect current data before submitting again.

## Customer walkthrough

Use disposable, authorized test data for writes.

1. Select Customers and inspect active and inactive records.
2. Select Add customer to create a customer with a name and unique email address, then edit these details. Editing preserves active status, including for inactive customers.
3. Deactivate an active test customer and confirm the action. Deactivation is irreversible through the supported API; no reactivation action is available.
4. Permanently delete an unreferenced test customer, whether active or inactive, after confirming the action. If existing orders reference the customer, the backend returns `409 CUSTOMER_HAS_ORDERS` and the customer remains. The app does not automatically deactivate it; deactivation is a separate confirmed action.

## Order walkthrough

Use disposable, authorized test data for order creation.

1. Select Orders and inspect the list. Open an order to load its details from the backend. Item names, unit prices and line totals are historical snapshots; customer details reflect current customer data. Order-item thumbnails show current product images, not historical image snapshots; missing or failed images use an independent fallback.
2. Select New order, choose an active customer and add one or more distinct active products. Each quantity must be an integer from 1 to 10000; use a separate row for each product.
3. Select Create order once, then use Inspect created order and inspect the refreshed list. Prices, discounts, subtotal, total and currency come from the backend; the form does not calculate estimates.

Order updates, deletion, cancellation and payments are unsupported. If a network error or HTTP 500 leaves creation uncertain, the order may already exist. Refresh and inspect the list before retrying; the app never automatically replays the write.

Automated tests use mocked API responses. Live backend write verification has not been performed.

## Checks

```sh
npm run typecheck
npm run build
npm test
```

## API contract tooling

See [API discovery and capabilities](docs/api-discovery.md), the [OpenAPI snapshot](api/openapi.json) and [generated TypeScript declarations](src/shared/api/schema.d.ts). Discovery describes broader backend capabilities than this milestone implements.

```sh
npm run api:generate
```

Generate types from the checked-in snapshot; never edit generated declarations manually. For an authorized contract refresh, download a verified backend specification, inspect its changes and regenerate types. Keep the snapshot, generated declaration and dependency lockfile consistent for review. Dependency ranges are declared in `package.json`; exact installed versions are locked in `package-lock.json`.

The initial snapshot was copied from `/tmp/agentic-order-service-openapi.json` on 2026-10-19. Backend sources and backend-specific agent instructions are maintained separately.
