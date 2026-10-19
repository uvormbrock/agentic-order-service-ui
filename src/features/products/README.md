# Products

`ProductsView` lists active and inactive products with EUR prices and thumbnail fallbacks. `ProductDialog` creates or edits name/price, confirms deactivation, and separately uploads or replaces JPEG/PNG images using multipart `file`. Editing preserves inactive status; product deletion, reactivation and image deletion are not UI actions.

`api.ts` checks expected success statuses and usable product confirmations; image upload requires HTTP 204. Pending writes block duplicate submission. Uncertain outcomes retain dialog input and ask the user to refresh/check the product or image before retrying; writes are never replayed automatically. A refresh or thumbnail failure after a confirmed save does not undo that save. Requests share the centralized timeout described in the [root README](../../../README.md#demo-boundaries).

See [API discovery](../../../docs/api-discovery.md) for the authoritative contract and image restrictions. Automated write tests use mocks; browser and live-write verification remain pending.
