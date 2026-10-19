# Orders

`OrdersView` lists orders; `OrderDetailsDialog` fetches details independently. `NewOrderDialog` creates orders with an active customer, distinct active products and integer quantities of 1–10000. Displayed amounts and currency come from the backend. Product names/prices/totals are historical snapshots; customer details and thumbnails are current. Update, cancellation and deletion are unsupported.

`api.ts` also serves customer Shopping checkout. Creation requires HTTP 201 and a usable order confirmation matching the requested customer before reporting success. Pending writes block duplicate submission. Uncertain outcomes retain the order draft or Shopping cart and ask the user to inspect Orders/My Orders before retrying; writes are never replayed automatically. A later list-refresh failure does not undo confirmed creation. Requests share the centralized timeout described in the [root README](../../../README.md#demo-boundaries).

See [API discovery](../../../docs/api-discovery.md) for the contract. Automated write tests use mocks; browser and live-write verification remain pending.
