# Customers

`CustomersView` lists active and inactive customers. `CustomerDialog` creates/edits name and email, confirms irreversible deactivation, and confirms permanent deletion. `409 CUSTOMER_HAS_ORDERS` retains the customer without attempting deactivation; reactivation is unsupported.

`api.ts` checks expected success statuses and usable customer confirmations; deletion requires HTTP 204. Pending writes block duplicate submission. Uncertain outcomes retain dialog input and ask the user to refresh/check the customer before retrying; writes are never replayed automatically. A refresh failure does not undo a confirmed save or deletion. Requests share the centralized timeout described in the [root README](../../../README.md#demo-boundaries).

See [API discovery](../../../docs/api-discovery.md) for backend validation and deletion constraints. Automated write tests use mocks; browser and live-write verification remain pending.
