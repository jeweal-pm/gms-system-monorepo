# Frontend conventions: load-to-stock

- UI revision: 1 (draft). Follows [architecture](../architecture.md) and the Purchase conventions ([purchase/conventions](../purchase/conventions.md)).

## Paths and ownership

- Feature code: `frontend/src/features/load-to-stock/` (`api.ts`, `form.ts`, `components/LoadToStockPage.tsx`, `components/purchase-line-picker.tsx`, `components/load-mode-dialog.tsx`, `components/load-table.tsx`, `components/split-group-row.tsx`, `*.test.ts(x)`).
- Route: `frontend/src/app/(app)/inventory/load-to-stock/page.tsx` and `[id]/page.tsx` (exact folder follows the existing route groups; frontend verifies).
- Shared edits (serialized through the parent): `frontend/src/features/home/navigation.ts` (REAL_PAGE_HREFS), `frontend/src/features/approve-center/menus.ts` (availability), `frontend/src/features/trade-document/*` and `frontend/src/features/quotation/components/items/ItemEditorPanel.tsx` only for an additive Load `DocumentKind` option (no discount, Stock/Sale Price).
- API client: the new service's tRPC client is decided by SA (gateway route or a new client like `masterTrpc`); no client is created before the contract.

## Components and state

- Reuse `DocumentForm`, `QuotationHeader`, `ItemPhotoBox`, `ItemEditorPanel`, `RailButtons`, `DocumentDaybook`, `approval-flow.tsx`, `use-confirm`, `useNumberFormat` (C).
- Form state in react-hook-form + zod as other documents (C). The document header holds one `mode` (NONE / SPLIT / MERGE; owner Q-LS-07; contract `LoadInput.mode`). Rows carry only `sources[]`, with no per-row mode or batch. Split groups are rendered by grouping rows on their single source line. Merge is one row with ≥ 2 sources.
- Merge computation (Σpcs, Σweight, cost by each source's price unit, average price, details and photos from the highest THB-per-piece line; mixed units allowed; unit per ct unless all sources are per pcs, Q-LS-27) is a pure function in `form.ts`, unit-tested.

## Delivery

- No package installs. Unit + integration tests per [automated testing](../../../workflow/automated-testing.md). Both security roles once on the final diff.
