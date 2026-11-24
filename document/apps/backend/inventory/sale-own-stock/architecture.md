# Service architecture: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review). Decisions: [decisions](decisions.md); ADR: [ADR-0058](../../../../adr/0058-sale-own-stock-from-load-to-stock.md); TODO: [sale-own-stock](../../../../task/todo/sale-own-stock.md).
- Reuses unchanged: [inventory/sale architecture](../sale/architecture.md) (document, approval, saga driver, photos, totals), [load-to-stock architecture](../load-to-stock/architecture.md) (own stock), [lot-based-stock architecture](../../shared/lot-based-stock/architecture.md) (lots, FIFO).

## Domain and service boundaries

| Concern | Owner | Notes |
|---|---|---|
| Sale document, own-stock lines, allocation, ledger rows of a Sale | `backend-api-inventory`, module `sale` + component `stock` (`src/modules/stock/sale-stock.ts`, new) | schema `inventory`; one transaction, no cross-schema write |
| Own stock rows and buckets | inventory `stock` component | only `stock/**` code changes buckets (Load, holds, **sale-stock**); the Sale module calls it |
| Memo Stock lots for the picker, Reserve lines, Reserve settlement | `backend-api-master` | read / PUT through the existing token-authenticated internal API; Sale never reads `partner.*` |
| Reserve's hold on own stock | inventory `stock_hold` (type `reserve`), written by master's saga | Sale **reduces** it in tx1 only for a settled Reserve line; master stays the only writer of the Reserve document |
| Stock Card / Stock Value | inventory `reports/*`, read `stock_movement`, `stock_hold_document` | unchanged code except two registry rows |

No new service, gateway, container, process, queue, cache, worker, network, secret, volume or package. Nginx routes `/api/inventory/` already (the new read is one more GET under it; no new body cap).

## Modules and files (informative; the TODO rows own the exact paths)

```
backend-api-inventory/src/modules/
  stock/sale-stock.ts      NEW  pure planner + SQL: planOwnConsumption, lockCandidates, applyOwnDelta, reverseOwnDelta,
                                settleReserve (phase B), movement rows, loadHolders union
  stock/card-kinds.ts      +2 rows (SALE_OUT, SALE_OUT_REVERSAL)               shared file, parent-serialized
  stock/lots.ts            lotsAvailablePage gains `withSalePrice` (Sale read only)
  sale/stock-lots.ts       NEW  GET /sale/stock-lots (own first, then master memo lots)
  sale/{schemas,prepare,repository,service,read,routes}.ts   OWN_STOCK line, tx0 own step, fast path, refusal reversal, tx1 reserve settlement
  platform/master-api.ts   + saleMemoLots(); consumption response `allocations[].source` gains "OWN_STOCK"
backend-api-master/src/
  inventory-internal/      + POST sale/memo-lots; own-stock Reserve lines in sale-reads (search, prepare) and sale-consumption (phase B)
  master/router.ts         fromStock.lots: `sale` removed from permittedAny (BE-SO-009, after the frontend switch)
```

## Behaviour

### Read paths

- **`GET /sale/stock-lots`** (picker). Statement budget: own page = **1** statement (the `lotsAvailablePage` CTE on `stock_lot_open_idx`, `limit + 1`); Memo Stock page = **1** master call when the own page is not full. A group is listed when any of its open stocks matches `q` (lot, stone, stone code, cer no., source doc no.; never the Stock ID) or the date range; quantities always cover the whole group. Own rows add `salePrice`. No lock, no write, `Cache-Control: no-store`.
- **Save / Submit** (existing `prepare` step): own lot keys are resolved by **one local statement** (`lotKeys = ANY(...)`: attributes, `stockCount`, newest Load ref, Σ available, `sale_price`) plus, on an edit, this Sale's own applied allocation per lot (so the cap includes it). Master `prepare` is called only when the document has Reserve or Memo Stock lines (the call count of a Save is never above today's 2). Nothing is locked or held.
- **`GET /sale/{id}`**: own lines come from `sale_line` (snapshot) and the allocation presence (`allocated`); no master call for them, so a detail of an own-only Sale makes **no** master call at all (its current 3-statement idle budget grows by 0).

### Write paths

Common: every write starts with the guarded `UPDATE sale … WHERE id AND version = expectedVersion AND sync_state = 'IDLE'` of the existing service; `readSettingForShare(tx, 'sale')` decides approval ON / OFF as today.

**Own-stock step `applyOwn(tx, ctx)`** (tx0, inside the same `$transaction` as the guarded update and the op row; ≤ 6 statements for any line count):

1. Read the Sale's current own allocation (`sale_line_alloc` where `own_stock_uuid IS NOT NULL`, on-hand origin) and the desired `OWN_STOCK` lines (from the normalized document).
2. **One statement** locks the stocks of (current allocation ∪ candidates of the desired lots) `ORDER BY s.id FOR UPDATE OF s`, returning on-hand pcs/weight, `ref_doc_date`, `stock_id`, and `load.sync_state`. Candidates per lot: ACTIVE, `on_hand > 0` (or already allocated), FIFO `(ref_doc_date, stock_id)`, ≤ 500 per lot and ≤ 2,000 in all (`STOCK_LOT_TOO_LARGE`).
3. Pure `planOwnConsumption(current, desired, locked)` (UT-SO-01…): per line and dimension (pcs, weight) separately, **increase** → take from candidates in FIFO order (`min(on_hand_available, remaining)`), **decrease / removal** → release the newest allocation rows first; the delta per `(line, stock)`; refusals: short → `SALE_SOURCE_SHORT` fieldErrors, Load syncing → `SALE_STOCK_BUSY`, lot gone → `SALE_REFERENCE_INVALID`.
4. **One set-based `UPDATE stock … FROM (VALUES …)`**: `on_hand −= d, sold += d` (negative d reverses); `first_used_at` set on the first use; `version + 1`. The existing CHECKs (`stock_buckets_check`, `pcs = Σ buckets`) are the last line of defence.
5. **One `createMany` on `stock_movement`**: per stock one row (two when pcs and weight move in opposite directions), kind `SALE_OUT` (negative deltas) / `SALE_OUT_REVERSAL` (positive), `document_type = 'sale'`, `document_id = sale id`, `revision` = the op revision (or `applied_revision + 1` on the fast path), `cost_delta_base = 0`, `created_by` = actor.
6. Return `{ delta, after }`: `delta` = signed `(lineId, stockUuid, stockId, seq, pcs, weightCt)` rows (what refusal must undo), `after` = the allocation rows the Sale will have once it completes. Both go into the op payload (`payload.own`), bounded to 200 lines × the stocks they touch (≪ 100 KiB).

The allocation table itself is **not** touched in tx0 (an edit replaces `sale_line` rows in tx1, which cascades `sale_line_alloc`); it is written once, from `after`, when the Sale completes.

**Completion `completeOwn(tx, ctx)`** (end of the completing transaction: tx1 of the saga, or tx0 on the fast path; ≤ 3 statements): `DELETE` the Sale's own allocation rows + `INSERT … SELECT` from `after` joined to the live lines (a line removed meanwhile is skipped, as `writeSaleAllocations`); upsert the **`stock_hold_document`** header `(document_type 'sale', document_id, applied_revision, request_hash, document_no, doc_date, party_id, party_name)` for Stock Card (date and customer; `applied_revision` = op revision, `request_hash` = the op hash, both only to satisfy the table's CHECKs; they are not used for idempotency).

**Flows by shape of the Sale**

| Sale has | Apply path | Master called? |
|---|---|---|
| only `OWN_STOCK` lines (applied and desired) | **fast path**: one transaction = guarded update + `applyOwn` + status `APPROVED` + `completeOwn` (+ notification on Approve). No op row, `sync_state` never `SYNCING`, no `SYNC_PENDING` | no |
| `OWN_STOCK` + `STOCK` / `RESERVE` | saga: tx0 = guarded update + `applyOwn` + op row (payload `own`, master set without own lines); `SyncDriver.drive` -> master PUT; tx1 = status + `completeOwn` (+ memo allocation copy, + reserve settlement) | yes, master lines only |
| only `STOCK` / `RESERVE` (no own) | unchanged ADR-0054 | yes |
| edit that removes the last master line of an applied Sale | saga with an **empty** master set (releases master's side); the rule "master is called when applied or desired set has a master line" uses the **stored** lines of the APPROVED Sale as the applied set | yes (release) |

`masterNeeded = hasMasterLine(desired) || (kind ∈ {UPDATE, DELETE} && hasMasterLine(stored lines))`. For `CREATE / APPLY_DRAFT / APPROVE` nothing is applied before, so only the desired set counts (Restore returns a DRAFT with nothing applied, so a stale stored line never triggers a call).

**Refusal `refuseOp(tx, op)`** (master said `SALE_CONSUMPTION_*`, or the op is abandoned as refused): in the same transaction that marks the op refused, `reverseOwnDelta(tx, op.payload.own.delta)` applies the negated delta (same lock order, same statements, ledger `SALE_OUT_REVERSAL` / `SALE_OUT` rows), then the existing handling (delete the provisional CREATE Sale, or `sync_state = 'IDLE'`). Net effect: stock and Stock Card as before the attempt (the OUT and its reversal net to zero).

**Reserve own-stock settlement `settleReserve(tx, op, response)`** (phase B, inside tx1 before `completeOwn`, ≤ 6 statements):

1. Before-set = stored own allocation of `RESERVE` lines of this Sale (read **before** `replaceParts` of an UPDATE); after-set = rows of `response.allocations` with `source = "OWN_STOCK"`.
2. Per `(line, stock)` delta; lock the stocks and the Reserve's `stock_hold` rows (`reserve`, `R`, stock) `FOR UPDATE` in id order; verify `reserved ≥ d` and `hold ≥ d` for increases (else `SALE_OWN_ALLOCATION_DRIFT`); `reserved −= d, sold += d`; `stock_hold.pcs/weight −= d` (zero row deleted; a release re-inserts with `kind RESERVED`, `revision` = the hold document's `applied_revision`, `document_no` from it); ledger `SALE_OUT` / `SALE_OUT_REVERSAL`.
3. `R` = the line's `reserve_id` (payload document for an UPDATE, stored lines otherwise).

**Master side (phase B, BE-SO-007).** `planConsumption` accepts a RESERVE line whose Reserve line is own stock: no Memo Stock item; it settles `reserve_line.sold` and `reserve_line_alloc.settled_*` oldest seq first (`settleOldestFirst`, existing) under the existing lock order (Reserve header `FOR SHARE`, Reserve lines `FOR UPDATE`); it refuses `SALE_CONSUMPTION_RESERVE_BUSY` when the Reserve has an inventory hold sync in flight (the `source.syncing` rule of Memo Out Return); the response `allocations[].rows[]` carries `source: "OWN_STOCK"`, `stockUuid` = inventory `stock.id`. The From Reserve search filter becomes `(memo_stock_id IS NOT NULL OR own_stock_id IS NOT NULL OR lot_key IS NOT NULL)`, with a partial index for open own lines.

### Concurrency, timeouts, failure

| Case | Behaviour |
|---|---|
| Two Sales, same lot | `FOR UPDATE` in id order; the second sees the first's `sold`; `SALE_SOURCE_SHORT`, nothing changed |
| Sale vs Reserve / Memo Out hold on the same stock | same lock order as `applyHolds` (stock rows by id); no cycle (each transaction touches its own document row first, then stocks) |
| Sale vs Load edit / delete | Load's `lockLoadStocks` locks the same rows; "in use" (`on_hand ≠ pcs`) refuses the Load; a Load `SYNCING` refuses the Sale (`SALE_STOCK_BUSY`) |
| Crash after tx0, before master | op `PREPARED`, own stock already sold; the lazy re-drive (on access, start, 60 s sweep ≤ 20 ops, `sync:redrive`) calls master with the same revision and hash; a refusal reverses (see above) |
| Crash after master, before tx1 | op `CONFIRMED`; re-drive runs tx1 only (own part already in tx0; Reserve part recomputed from master's replayed response) |
| Master down / 5 s timeout | `503 SYNC_PENDING` as today; own stock stays sold while the op waits (the Sale shows `syncing`); fast-path Sales are unaffected |
| Statement timeout | 5 s `statement_timeout` inside the write transactions as the other Sale writes (`WRITE_TX`); a timeout rolls back tx0 whole |
| Stock Card between tx0 and completion | may show the OUT row without the Sale number / customer (header written at completion; the card falls back to the first movement date and an empty account, as for holds) |

### Capacity and rollout (4 GB RAM / 2 vCPU host)

- Containers and limits: unchanged (inventory 0.20 vCPU / 256 MiB, heap 160 MiB, pool 5 + authz 1; Compose total 1.75 vCPU / 2880 MiB). No cache, worker or Redis.
- Data: ≤ 50,000 stock rows, own-stock lines ≤ 200 per Sale; `sale_line_alloc` rows ≤ lines × stocks (one per line this round) ≪ 20,000 per day; ledger rows two per stock per apply.
- Per request: picker ≤ 2 inventory statements / 1 master call; own step ≤ 6 statements, completion ≤ 3, reserve settlement ≤ 6; master PUT unchanged (≤ 10 statements).
- **Measure before claiming fit** (PF-SO-01…03 in [testing](testing.md)): picker p95 with 5,000 open stocks ≤ 150 ms (own part) ; a 200-line own-stock approve p95 ≤ 700 ms and RSS growth ≤ 30 MiB; a lot of 500 stocks refused cleanly.
- Rollout order: migration (additive) → inventory image with the new routes and `OWN_STOCK` accepted → master image (memo-lots, then reserve own-stock, same release or earlier) → frontend → master grant cleanup. The frontend change is a pure revert if needed; the inventory image can run before the frontend (the new source is only used when sent).

## Container infrastructure

None requested. Not routed through Nginx beyond the existing `/api/inventory/` location; the master internal route is not exposed by Nginx. No `docker/`, Compose, `.github/**` or build-context change; devops: note only (existing inventory and master pipelines run the new tests).
