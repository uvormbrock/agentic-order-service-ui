<p align="center">
  <img src="docs/assets/vormbrock-logo.png" alt="Vormbrock" width="420">
</p>

# Agentic Order Service UI

A React prototype for administering products, customers and orders, with a local customer-shopping demo. It demonstrates agentic frontend development against a defined REST contract.

**Backend: [Agentic Order Service](https://github.com/uvormbrock/agentic-order-service)** — Spring Boot owns persistence, validation, business rules and authoritative monetary calculations. Start it separately using its [local demo instructions](https://github.com/uvormbrock/agentic-order-service#try-the-application-locally).

## Stack and structure

React, TypeScript, Vite and Mantine provide the UI; native fetch and generated OpenAPI types connect it to the API. Vitest and Testing Library cover behavior; V8 coverage feeds SonarQube Cloud.

`src/app` composes navigation. Feature modules under `src/features` own products, customers, orders and shopping. `src/shared/api` contains the small HTTP adapter and generated contract. State stays in React; the backend owns transactions and stored data.

## Features

Admin mode opens Products by default. All views handle loading, empty results and API errors.

- **Products:** names, EUR prices, active status and thumbnails; create/edit name and price; confirmed deactivation; separate JPEG/PNG image upload or replacement after creation. Files must be nonempty and at most 10 MiB, sent as multipart `file`; the backend validates content and dimensions. Editing preserves inactive status.
- **Customers:** active/inactive listing, create/edit name and email, confirmed irreversible deactivation, and confirmed permanent deletion of active or inactive unreferenced customers. `409 CUSTOMER_HAS_ORDERS` retains the customer without automatic deactivation.
- **Orders:** list, independently fetched details and creation with an active customer and distinct active products, each quantity 1–10000. Amounts and currency come from the server. Item names/prices/totals are historical snapshots; customer details and product thumbnails are current. Missing or failed images use a fallback.
- **Customer demo:** active customer selection, active catalog, an in-memory multi-product cart, confirmed checkout, server receipt and My Orders. Cart estimates use catalog prices; final prices, discounts and totals come from the backend. Changing customer resets shopping state; mode/customer/cart changes are locked during checkout. The cart clears only after a usable HTTP 201 confirmation for the selected customer.

## Run locally

Use Node.js 24 and npm, matching the CI runtime. Start the backend first at `http://127.0.0.1:18080`, following its own startup instructions. Then, in this repository:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open the URL printed by Vite. Configure the fixed backend origin in `.env.local` and restart Vite after changes:

```dotenv
BACKEND_URL=http://127.0.0.1:18080
```

`BACKEND_URL` is server-only. `VITE_` variables are public browser configuration and must not contain secrets. There is no runtime target setting. The development proxy forwards only anchored product, customer and order API paths, including canonical UUID item paths and product-image endpoints. It accepts no browser-supplied target. Production hosting must supply same-origin API routing; the development proxy is absent from the build.

## Short demo walkthrough

Use disposable, authorized test data: saves, deactivation, deletion and checkout modify backend data.

1. In Admin → Products, inspect thumbnails, create/edit a product and upload its image separately. A failed upload leaves the created product intact. Confirm deactivation only for a disposable product.
2. In Customers, add/edit a test customer. Confirm deactivation or permanent deletion only when intended; customers referenced by orders cannot be deleted.
3. In Orders, open an existing order. Use New order with active choices, add distinct product rows and integer quantities, then Create order. Inspect created order loads the saved detail; a later list-refresh failure does not undo successful creation.
4. Switch to Customer, select an active demo customer, add products, adjust/remove cart items and select Checkout → Confirm order. Inspect the receipt and My Orders. The cart has no persistence across page reloads.

## Demo boundaries

Admin/Customer modes change presentation only. There is **no authentication or role-based access control**; selecting a customer does not verify identity. My Orders fetches the full `GET /orders` response and filters it in the browser. This is **not a privacy boundary or a production-secure customer portal**.

Requests use a centralized 30-second timeout covering fetch and response-body consumption, including JSON and thumbnails. Internal callers can override it through the fourth `apiRequest` argument. Timeout or cancellation releases pending work; stopping a browser write request does not guarantee backend rollback.

The frontend never automatically replays writes. Network failures, timeouts, cancellation, HTTP 408, unclassified 5xx responses and unusable success confirmations leave write completion uncertain; inspect or refresh current data before retrying. A complete contract-shaped HTTP 503 `SERVICE_UNAVAILABLE` error is treated as classified unavailability or confirmed-rollback failure, without automatic replay. HTTP errors retain available server code/message and `X-Request-ID`; missing messages use an HTTP-status fallback rather than a connection-failure claim. Transport failures are reported separately.

Success requires the expected status and usable confirmation data (or the required bodyless 204). Failed or uncertain writes retain dialog input; uncertain checkout retains its cart and draft. A later list-refresh failure does not undo a confirmed save.

Reactivation, product deletion, order update/deletion/cancellation and payments are unsupported. Image writes require backend deployment opt-in: `403 PRODUCT_IMAGE_WRITES_DISABLED` is shown without bypassing the restriction. Backend security/CORS changes are outside this frontend.

## Checks and contract maintenance

```sh
npm run typecheck
npm test
npm run build
npm run test:coverage
```

Vitest runs in jsdom with mocked API responses, including writes. ESLint is not configured. Coverage writes text/LCOV reports under ignored `coverage/`, excluding tests and generated declarations; no coverage threshold is configured.

Install Chromium once, then run the browser smoke tests:

```sh
npm exec playwright install chromium
npm run test:e2e
```

Playwright runs the actual application in Chromium with deterministic browser network fixtures; no backend or database is required. It manages a dedicated Vite server on `127.0.0.1:4177`, without the development backend proxy or reuse of an existing server. Exactly three scenarios cover:

1. Admin navigation between Products, Customers and Orders, plus Customer/Admin switching and active-mode highlighting.
2. Product catalog thumbnails and missing-image fallback, populated edit details, and cancelling without writes.
3. Active customer/product selection, inactive-product exclusion, cart quantity changes, and checkout confirmation cancelled without `POST /orders`.

These are mocked browser smoke tests, not verified live-backend integration. Live backend write verification remains pending. Failure reports and test artifacts are ignored by Git.

The [SonarQube Cloud workflow](.github/workflows/sonarqube.yml) runs on pushes to `main` or manual dispatch, installs locked dependencies, runs coverage, then scans using the configured `SONAR_TOKEN` secret. [Scanner configuration](sonar-project.properties) imports `coverage/lcov.info`. Configuration does not imply a successful remote analysis or quality gate.

The [OpenAPI snapshot](api/openapi.json) is authoritative. See [API discovery](docs/api-discovery.md) for backend capabilities and constraints, and [generated declarations](src/shared/api/schema.d.ts) for compile-time types. Never edit generated declarations manually. For authorized contract refreshes, obtain a verified backend specification, review changes and regenerate:

```sh
npm run api:generate
```

Keep the snapshot and generated declarations consistent. Dependency ranges live in `package.json`; exact installed versions are locked in `package-lock.json`.

## Native multi-agent workflow

The main Codex session is the sole Orchestrator, supported by six configured native specialists.

| Role | Responsibility |
| --- | --- |
| Orchestrator | Sequence work, assign file ownership and consolidate evidence. |
| requirements | Analyze API capabilities and UI acceptance criteria. |
| architect | Design the smallest maintainable frontend structure. |
| implementer | Implement approved frontend work in assigned files. |
| tester | Verify frontend behavior and report actual check results. |
| reviewer | Independently review implementation, REST contracts and obvious security risks. |
| documenter | Keep concise documentation aligned with actual behavior. |

[Project configuration](.codex/config.toml) limits concurrent specialist threads to three. Specialists do not delegate recursively; one writer owns each file, and independent review remains separate from implementation.

[AGENTS.md](AGENTS.md) defines scope, handoffs, quality gates and the shared maximum of three correction iterations. Human acceptance and permission to commit, push or deploy remain separate explicit decisions.
