# Frontend data flow: purchase

- UI revision: 1 (pending-review)
- Related shared/SA API contract: none yet. The SA bundle `document/apps/backend/master/purchase/` is requested in the [SA handoff](../../../coordination/handoffs/purchase-sa.md). For the patterns, see the [memo-return contract](../../../apps/backend/master/memo-return/decisions.md) and the [reserve contract](../../../apps/backend/master/reserve/api-contract.md).
- Backend requirement: **requires-sa**. There is no Purchase table, service, router or `MasterMenu` entry in `backend-api-master` (C, 2026-11-04).

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Currency list, Exchange Rate (I-05/06) | **existing** `currency.options` | — / `{ items, baseCode }` | tRPC key; staleTime 60 s (C) | Field message when it can't load | master (no change) |
| Vendor + address lists (I-02/03) | **proposed** `purchase.options` (shape `vendorDocumentOptions`, as `memoReturn.options`) | `{ vendorId? }` (keeps an inactive saved vendor) / `{ vendors[], stone… }` | tRPC key | Field message | backend BE-PU-003 |
| Number preview (H-01) | **proposed** `purchase.nextNumber` (Document Setup `purchase`) | `{ docDate }` / `{ docNo }` | enabled only for a new document with a valid date; staleTime 10 s (C) | "—" while loading | BE-PU-003 |
| Daybook (R-01) | **proposed** `purchase.list` | `{ limit ≤ 50, cursor? }` / `{ items[{id, docNo, docDate, status, vendorName}], nextCursor }` | tRPC key; invalidated after every write | "Loading…", empty text, error text (C `DocumentDaybook`) | BE-PU-003 |
| Open a saved document | **proposed** `purchase.get` | `{ id }` / document + `version` | Keyed by id. The page remounts on `id:version` (C). | Loading / not found / error | BE-PU-003 |
| Save new / existing (H-05) | **proposed** `purchase.create` / `purchase.update` | header + lines ≤ 200 + charges; update carries `expectedVersion` / `{ id }` | Invalidate `purchase.list/get/nextNumber`, `memoStock.list` | Save disabled + "Saving…" while busy (prevents a double submit) | BE-PU-003 |
| Delete (H-05) | **proposed** `purchase.delete` | `{ id, expectedVersion }` | as above | confirm modal first | BE-PU-003 |
| Approve (H-06, Q-PU-06) | **proposed** `purchase.approve` | `{ id, expectedVersion }` | as above + `memoOutstanding.*` | confirm, "Approving…" | BE-PU-004 |
| Memo Stock picker (T-02) | **existing** `memoStock.list`, **grant change** to also accept `purchase:VIEW` | `{ vendorId, currency, limit 50, q?, from?, to? }` / items + `nextCursor` | infinite query; staleTime 10 s (C `useMemoStock`) | Dialog loading / empty "No memo stock from this vendor in {currency}." / error | BE-PU-003 (grant only) |
| Purchase Order picker (T-03) | **none**: PO does not exist | — | — | Button disabled (Q-PU-02) | later PO feature |
| Decimal places | **existing** `decimalSetup.get` through `NumberFormatProvider` | — | provider (C) | Defaults 2 / 2 places (C) | none |

## Bounds and races

- Lists are paged with at most 50 rows per call (C). A document holds at most 200 lines (C `LINES_MAX`). The search input is debounced 250 ms (C, Memo Stock dialog).
- Optimistic concurrency uses `expectedVersion` on update, delete and approve (C pattern). A stale version shows the conflict message and keeps the user's edits ([error-handling](error-handling.md)).
- Pending is checked again at approval under a row lock (requires-sa, Q-PU-03). Two pending purchases may name the same Memo Stock item, and only the first approval succeeds (Memo Return / Reserve pattern, C).
- Under the Q-PU-01 default there is **no mock or placeholder data**. FE-PU-002 builds the page against `usePurchaseApi`, typed to the SA contract once approved. Until then the sidebar link stays the placeholder, and the page is reachable only by URL in development.

## Revision 2 additions (2026-11-04)

See [ui-spec › Revision 2](ui-spec.md#revision-2-add-memo-stock-and-purchase-order-dialogs), R2-D-01…07. Every row below is **requires-sa**.

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Add Memo Stock tabs, groups and Status column (FE-PU-004/008) | **existing** `memoStock.list`, **extended** (or a Purchase-specific query; SA decides) | Input adds `status?: SOLD / IN_STOCK`; `q` also matches the invoice no. Output adds, per item, `status`, the sold quantity and amount, `sale? { invoiceNo, invoiceDate, customerName }`, an optional piece type, and `counts { all, sold, inStock }` for the filters | infinite query keyed by the full input; staleTime 10 s (C) | per-tab empty texts (ui-spec R2-MS) | BE (R2-D-01…04) |
| Add Purchase Order (FE-PU-009) | **proposed** open-PO-lines query (name by SA) | `{ vendorId, currency, status?, q?, from?, to?, cursor?, limit ≤ 50 }` / lines with PO header fields (id, docNo, docDate, dueDate), attributes, ordered and purchased quantities, net unit price, priceUnit, plus `counts` and `nextCursor` | infinite query; staleTime 10 s; invalidated after a Purchase save or approve | "No open purchase order lines from this vendor in {currency}." | BE (R2-D-05) |
| Save a picked PO row | `purchase.create` / `update` lines carry `purchaseOrderLineId` (or `memoStockId`) | the server re-reads the caps and prices | invalidate the open-PO-lines query too | row error "Row n: …" when the outstanding quantity changed | BE (R2-D-06/07) |

No placeholder data: until SA approves these, the dialogs are built against typed fixtures in tests only (Q-PU-01).
