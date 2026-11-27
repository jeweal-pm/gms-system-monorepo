# Frontend data flow: merge-split

- UI revision: 1 (pending-review). **All operations are proposed (requires-sa)**; names are assumptions following the Load to Stock / Stock Adjustment REST contracts under `/api/inventory/v1` (`backend-api-inventory`, ADR-0052/0059, C). The SA contract replaces these names where it differs.
- Existing pieces reused (C): auth leaf `merge-split` (catalog), approval type `merge-split` (`INVENTORY_APPROVAL_TYPES`), Document Setup key `merge-split` (code MS), Decimal Setup, Location Master names, `GET /approval-settings`.
- Money and quantities are decimal strings.

| UI action / TODO | Operation | Input / output (assumed) | Query key | Owner |
|---|---|---|---|---|
| Access | existing `permission.mine` leaf `merge-split` | — | existing | none |
| Approval mode | existing `GET /approval-settings` (type `merge-split`) | `{ items[{type, requireApproval}] }` | `APPROVAL_SETTING_QUERY` | inventory |
| Options | proposed `GET /merge-split/options` | `{ companyCurrency, locations: string[], stone }` | `['merge-split','options']` | inventory |
| Number preview | proposed `GET /merge-split/next-number?docDate` | `{ docNo }` (not reserved) | staleTime 10 s | inventory → master |
| From Stock (P-01) | proposed `GET /merge-split/stock` | `q?, location?, excludeStockIds?, excludeDocId?, cursor, limit ≤ 50` / `{ items[{stockId, lot, stoneCode, attrs, location, priceUnit, unitCostThb, availablePcs, availableWeightCt, costAmountThb, stockPrice, salePrice, photoCount, loadedFrom{docNo, docDate}}], nextCursor }`. Own stock, on hand > 0, not on a Pending Merge/Split | infinite, staleTime 10 s | inventory |
| Daybook | proposed `GET /merge-split` | `status?, deleted?, q?, cursor, limit ≤ 50` | invalidated after writes | inventory |
| Open saved | proposed `GET /merge-split/{id}` | `{ header{docNo, docDate, ref, note, mode: 'SPLIT'\|'MERGE', status}, sources[], rows[{id, stockId?, sources[{stockId, pcs, weightCt}], location, attrs, lot, priceUnit, unitCostThb, costAmountThb, stockPrice, salePrice, photoIds}], totals{source, result}, approval, inUse, version }` | by id | inventory |
| Save | proposed `POST /merge-split`, `PUT /merge-split/{id}` | `{ docDate, ref?, documentNote?, mode, rows 1…200 }`; SPLIT: each row 1 source, Σ per source = available; MERGE: 1 row, ≥ 2 sources (full available). Update adds `expectedVersion`. Out `{ id, docNo, status, version, stockIds }` | invalidate list/get/stock picker, stock-card, stock-value | inventory |
| Send / Approve / Revise / Reject | proposed `POST /merge-split/{id}/submit` · `/approve` · `/request-revision` · `/reject` | `{ expectedVersion, note?/reason? }` | approve-center keys | inventory |
| Delete / Restore | proposed `POST /merge-split/{id}/delete` · `/restore` | `{ expectedVersion }` | as Save | inventory |
| Photos | proposed `POST /merge-split/photos/from-stock` (copy source stock photos), `POST /merge-split/photos`, `GET /merge-split/photos/{id}` | `{ stockId }` / `{ ids ≤ 5 }` | per row | inventory |

Bounds: pages of 50; ≤ 200 rows / 200 sources per document; no polling (4 GB / 2 vCPU). No mock data in the app; tests use typed fixtures until the contract is approved.
