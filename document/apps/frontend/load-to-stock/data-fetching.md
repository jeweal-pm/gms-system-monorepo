# Frontend data flow: load-to-stock

- UI revision: 1 (draft), aligned with the owner answers of 2026-11-16 ([open-questions](open-questions.md)).
- Related API contract: SA rev 1 (pending review) [api-contract](../../backend/inventory/load-to-stock/api-contract.md) and [ADR-0052](../../../adr/0052-load-to-stock-in-backend-api-inventory.md). It is REST under `/api/inventory/v1` (`backend-api-inventory`, the owner's new service). The names below follow that contract. Money and quantities are decimal strings.
- Existing pieces reused (C): auth catalog leaf `load-to-stock`, Decimal Setup (`decimalSetup.get`). The approval setting for inventory types is read through the inventory `GET /approval-settings` (contract).

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Access (FE-LS-002) | **existing** `permission.mine` leaf `load-to-stock` | — | existing | no-access page | none |
| Approval mode (FE-LS-009) | **proposed** `GET /approval-settings` | — / `{ items[{type, requireApproval, version}] }` (type `load-to-stock`) | focus refetch as `APPROVAL_SETTING_QUERY` (C) | buttons hidden until known | inventory |
| Options (I-03, LT-5, M-04) | **proposed** `GET /load-to-stock/options` | — / `{ companyCurrency, stone, locations[{id, code, name}] }` | `['load-to-stock','options']` | field message | inventory |
| Account (I-02, Q-LS-01/03) | **proposed** `GET /load-to-stock/vendors` | `q, cursor, limit` / `{ items[{id, code, name}], nextCursor }`: vendors that have a loadable line. **One vendor** per document; several PUs and currencies allowed | infinite | field message | inventory |
| Number preview (H-01) | **proposed** `GET /load-to-stock/next-number` | `docDate` / `{ docNo }` (not reserved) | new doc only; staleTime 10 s | "—" | inventory → master Document Setup |
| Add From Purchase (P-01) | **proposed** `POST /load-to-stock/purchase-lines/search` | `{ vendorId?, q?, from?, to?, excludeLineIds?, excludeAllocationOf?, cursor?, limit ≤ 50 }` / `{ items: PurchaseLineRef[], nextCursor, total }`. Each item has `purchaseLineId`, `purchase{id, docNo, docDate, currency, rate}`, attrs, `location`, `priceUnit`, `netUnitPrice`, `unitCostThb`, `remainingPcs`, `remainingWeightCt`, `remainingAmountThb`, `photoCount`, `itemNote` | infinite query, staleTime 10 s | dialog loading / empty / error + retry | inventory → master |
| Daybook (R-01) | **proposed** `GET /load-to-stock` | `status?, deleted?, q?, cursor?, limit ≤ 50` / `{ items[{id, docNo, docDate, status, reviewNote, vendorName, …}], nextCursor }` | invalidated after writes | `DocumentDaybook` states (C) | inventory |
| Open saved (route `[id]`) | **proposed** `GET /load-to-stock/{id}` | — / `LoadOut`: header with **`mode`**, `vendor`, `currency`; `sources`; `rows` (`stockId`, `unitCostThb`, `costAmountThb`, `stockPrice`, `salePrice`, `photoIds`); `totals`; `approval`; `inUse`; `syncing`; `version` | keyed by id | loading / not found / error; `syncing` → read-only | inventory |
| Save (H-05) | **proposed** `POST /load-to-stock` / `PUT /load-to-stock/{id}` | `LoadInput`: header `{ docDate, vendorId, ref?, documentNote?, mode }`, with **one mode per document** (owner Q-LS-07; no per-row mode or batch), plus `rows` 1…200. Each row: `{ id?, sources[{purchaseLineId, pcs, weightCt}]` (NONE/SPLIT exactly 1, MERGE ≥ 2), `locationId, parcel?, attrs, stockPrice, salePrice` (both required, owner Q-LS-13), `itemNote?, photoIds ≤ 5 }`. Update adds `expectedVersion`. Output `{ id, docNo?, version, status, stockIds }` | invalidate list, get, search, next-number, and Purchase queries | Save disabled, "Saving…" | inventory |
| Send to approve | **proposed** `POST /load-to-stock/{id}/submit` | `{ expectedVersion }` | as Save | confirm (C `sendToApproveConfirm`) | inventory |
| Approve / Revise / Reject (FE-LS-011) | **proposed** `GET /approval/summary`, `GET /approval/pending?type=load-to-stock`, `POST /load-to-stock/{id}/approve` · `/request-revision` (`note`) · `/reject` (`reason`) | `{ expectedVersion, note? / reason? }` | approve-center keys | existing Approve Center UI | inventory |
| Delete (H-05) | **proposed** `POST /load-to-stock/{id}/delete` (soft, ADR-0045) | `{ expectedVersion }` | as Save | confirm | inventory |
| Row photos (L-02, M-12) | **proposed** `POST /load-to-stock/photos/from-purchase-line` (on pick: copies the PU line photos as the row's initial photos), `POST /load-to-stock/photos` (multipart upload), `GET /load-to-stock/photos/{id}` | `{ purchaseLineId }` / `{ ids ≤ 5 }`; the row keeps `photoIds` ≤ 5 and the user can change them (owner Q-LS-14). Merge: the photos of the highest-priced source (Q-LS-27) | per row | upload errors | inventory + infra storage |

## Cost rule (owner Q-LS-12)

Cost follows the PU line's price unit:

- unit cost THB = net unit price × PU rate;
- per ct: cost = loaded weight × unit cost;
- per pcs: cost = loaded pcs × unit cost;
- the PU keeps the rest.

Merge accepts mixed units. Row cost = Σ source costs. The row unit is per ct unless every source is per pcs (Q-LS-27). The server computes `unitCostThb` and `costAmountThb`; the UI previews the same formula.

## Bounds and races

- Picker pages hold 50 rows. A document holds at most 200 rows and 200 sources in total (contract). Search is debounced 250 ms (C).
- `expectedVersion` is sent on update, submit, delete and approve. A stale version returns `409 LOAD_TO_STOCK_CHANGED`; the UI shows the conflict message and keeps the user's edits.
- Remaining is re-checked under lock at Approve (approval ON) or at Save (approval OFF). Drafts hold nothing (Q-LS-06).
- **No mock data** in the app. Until the SA contract is approved, components are built against typed fixtures in tests only (Purchase Q-PU-01 precedent).
- Capacity (4 GB / 2 vCPU): every list is paged and bounded, with no polling. The container budget is in the SA/infra bundle.
