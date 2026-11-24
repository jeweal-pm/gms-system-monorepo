# Architecture: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

```
browser ──REST /api/inventory/v1/stock-adjustment*──► nginx ──► backend-api-inventory:3301
                                                              │  modules/stock-adjustment/
                                                              │    routes.ts   (Hono, Zod, requireGrant)
                                                              │    service.ts  (create/update/delete/restore/submit/approve/revise/reject)
                                                              │    repository.ts (SQL, advisory lock for numbering, version guard)
                                                              │    read.ts     (list/get/stock picker)
                                                              │  modules/stock/adjust.ts  adjustStocks()/reverseAdjust()  ◄─ only stock writer
                                                              │  platform/approval/settings.ts (type stock-adjustment)
                                                              └─► api-master (internal) : document-numbering/resolve, reference (locations)
```

## Module layout (copy `src/modules/sale/`)
| File | Role |
|---|---|
| `routes.ts` | mounted in `src/app.ts` beside sale routes |
| `schemas.ts` | Zod inputs (strict), decimal strings |
| `service.ts` | status machine of ADR-0050; calls `adjustStocks` on apply and `reverseAdjust` on edit/delete of an effective doc |
| `repository.ts` | inserts/updates, `expectedVersion` guard, `explainMiss` pattern from load-to-stock |
| `read.ts` | detail, daybook (keyset), From Stock page |

## Effect path (one transaction)
1. Lock the document row and check its version.
2. If this is the first save, resolve the number. This is an HTTP call to master, so it happens **before** the transaction, as load-to-stock does. The number is reserved under the advisory lock pattern.
3. `adjustStocks(tx, adjustmentId, lines)`:
   - lock the stocks in id order;
   - run the stale/location/status checks;
   - apply one UPDATE ... FROM (VALUES …);
   - do one INSERT into `stock_movement`;
   - write `applied_version` back to the lines.
4. Update the document status, `auto_approved` and `applied_at`.

## Reads
- The From Stock picker uses `lotsAvailablePage` with `location` plus own-only filters (stock_lot_open_idx).
- Stock Card / Stock Value pick up `ADJUST*` movements through `CARD_KINDS` (no other change).

## Capacity (4 GB / 2 vCPU)
- An apply with 200 lines runs at most ~5 statements.
- The picker reads 1 statement per page of ≤ 50 rows.
- There is no new cache, job or container.
