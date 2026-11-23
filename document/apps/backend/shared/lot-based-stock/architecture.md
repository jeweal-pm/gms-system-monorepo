# Architecture: lot-based stock (SA revision 1, approved 2026-11-20)

Bundle index: [decisions](decisions.md) · [api-contract](api-contract.md) · [authorization](authorization.md) · [database-diagram](database-diagram.md) · [sequence-diagram](sequence-diagram.md) · [error-handling](error-handling.md) · [dependencies](dependencies.md) · [testing](testing.md) · TODO [lot-based-stock](../../../../task/todo/lot-based-stock.md) · ADR [0055](../../../../adr/0055-lot-based-stock-picking-and-allocation.md)

## Owning domains and boundaries

| Concern | Owner (writer) | Schema | Notes |
|---|---|---|---|
| Memo Stock rows, `lot_key`, buckets | `backend-api-master` | `partner` | Only master locks/allocates Memo Stock |
| Master document lines + `<doc>_line_alloc` | `backend-api-master` | `partner` | Quotation, Reserve, Memo Out, Memo Out Return, Memo Return, Purchase |
| Own stock rows, `lot_key`, holds, movements | `backend-api-inventory` (Load to Stock / stock platform module) | `inventory` | Hold API unchanged; new read `stock/lots` |
| Sale lines + `sale_line_alloc` (copy of master result) | `backend-api-inventory` Sale module | `inventory` | Sale never writes `partner`; consumption via master internal API |
| Sale consumption ledger | `backend-api-master` | `partner.sale_consumption*` | Re-keyed per memo stock |

The modules of `backend-api-inventory` follow ADR-0052 D1: Load to Stock and Sale (now), and later Merge/Split, Transfer, Adjustment, Barcode, Account Outstanding and Reports. They are still one Hono process (`backend-api-inventory:3301`), and each module owns its own tables. The Sale module reads own-stock lot candidates only through the stock module's service interface, never its tables directly, and only when phase 2 is built. No cross-schema read, write or transaction exists. No gateway is used: Nginx routes `/api/master/*` and `/api/inventory/*` directly.

## Components (to be built by backend)

```
backend-api-master/src/trade-document/
  lot-key.ts              # lot_key format/validation, cursor encode/decode (date|lotKey)
  lot-allocation.ts       # pure: allocateFifo, releaseNewestFirst, settleOldestFirst
  lot-stock.service.ts    # memoStock.lots, purchase.memoStockLots, fromStock.lots (merge with inventory)
  lot-apply.ts            # lockLotCandidates (one id-ordered FOR NO KEY UPDATE), writeAllocations (fixed table map), bucket SQL over allocations
  (existing) memo-stock.service.ts take/release keep working on per-item totals built from allocations
backend-api-master/src/inventory-internal/sale-consumption.ts   # v2 lines (lotKey), allocation result
backend-api-master/src/inventory-client/inventory-client.ts     # + stockLots(keys)
backend-api-inventory/src/modules/load-to-stock|platform/stock/ # + internal POST /internal/v1/master/stock/lots, grouped /stock/lots/available
backend-api-inventory/src/modules/sale/                          # lot lines, v2 consumption request, sale_line_alloc
```

## Apply pipeline (master document, Memo Stock)

1. The engine's existing apply transaction (approval ON: Approve; OFF: Save/Edit/Delete) computes the **desired** quantity per line, and the previous allocation for an edit.
2. `lockLotCandidates(tx, keys, legacyIds)`:
   - runs `SELECT … FROM memo_stock WHERE (lot_key = ANY($keys) OR id = ANY($ids)) AND <bucket open> ORDER BY id FOR NO KEY UPDATE LIMIT 2001`;
   - above 2,000 rows, or above 500 for one key, gives `STOCK_LOT_TOO_LARGE`.
3. `lot-allocation.ts`:
   - increases go through `allocateFifo` over the candidates sorted by (ref date, stock_id);
   - decreases go through `releaseNewestFirst` over the line's unsettled allocation;
   - a short line raises the document's existing short error, with `lines.N.pcs|weightCt` `exceeds_pending` and `details.available`.
4. Per-item totals are built from the allocation deltas. The existing `takeFromMemoStock` / `releaseToMemoStock` / purchase bucket SQL then runs unchanged. It is already summed per item (INV-20261031-001).
5. The allocation rows are replaced for the touched lines (one `DELETE` plus one bulk `INSERT` per alloc table).

Downstream (Memo Out Return, Sale From Reserve) locks the source lines (as today), then their allocation rows `FOR UPDATE` (id order), then the stock rows. It runs `settleOldestFirst`, updates `settled_*`, and moves the buckets per stock. The lock order is the same everywhere: document header → source lines → allocation rows → stock rows (id order), as the existing source-lock does.

## Own stock in master documents (D7)

The existing ADR-0052 D19 saga is kept. Only H_new is computed differently:

1. **Before tx0.** For own-stock lot lines whose quantity increases, master calls inventory `POST /internal/v1/master/stock/lots` (≤ 200 keys, 2 s timeout) and gets the candidates with `on_hand`, FIFO. It allocates in memory. Unchanged or decreased lines use their stored allocation, so no call is made, which keeps the D17 "kept" rule.
2. **H_new** = the per-stock sum of the new allocations. Acquire and release are split as today. The `PUT stock-holds` call is unchanged.
3. **Refusal.** `STOCK_HOLD_EXCEEDS_AVAILABLE` (details: stock id) is mapped to the lot line holding that stock, as `lines.N.pcs` `exceeds_pending`, with "Lot changed, please refresh". Nothing is changed (saga step 1 semantics).
4. **tx1** writes the own-stock allocation rows next to the line.

## Sale (inventory) consuming Memo Stock

The inventory Sale module sends lot-level desired lines in the existing set-semantics PUT. Master:

1. locks the Reserve lines and allocation rows (RESERVE lines) and the lot candidates (STOCK lot lines);
2. computes the delta against the stored `sale_consumption_line` rows;
3. allocates, settles or releases;
4. writes the per-stock consumption rows and stores the per-line allocation in `result`.

The inventory tx1 copies `result.allocations` into `sale_line_alloc` for audit and reports (never returned to the browser, owner Q-LOT-10). Replays return the stored result, so allocation is deterministic per revision.

## Picker queries (bounded, no N+1)

`memoStock.lots` and `purchase.memoStockLots`:

1. **Matching keys.** `SELECT lot_key, max(ref_date) AS d FROM memo_stock WHERE <open bucket> [vendor, currency] GROUP BY lot_key HAVING bool_or(<q/date match>) AND (d, lot_key) < cursor ORDER BY d DESC, lot_key DESC LIMIT 51`. This uses the partial index `memo_stock_lot_open_idx`.
2. **Aggregate** for those ≤ 51 keys: sums, the newest ref plus the ref count, and the shared attributes (including the item note) from the first row; every key field is uniform within a group. No Stock ID or Stock ID count is selected for the browser (owner Q-LOT-10).

`fromStock.lots` runs (1)+(2) for Memo Stock and **one** inventory call `POST /internal/v1/master/stock/lots/available` with the same filters, cursor and limit + 1 in parallel (2 s). It merges by (d DESC, lot_key DESC). The `M…` / `O…` key prefixes make the order total. When inventory is down: Memo lots only and `ownStock: "UNAVAILABLE"`, as D16.

## Capacity (4 GB RAM / 2 vCPU, ADR-0024)

- No new container, process, worker, cache, Redis or replica. Limits unchanged: master 0.25 vCPU / 384 MiB, inventory 0.20 vCPU / 256 MiB (heap 160 MiB) with pool 5 + 1. Compose total stays **1.75 vCPU / 2880 MiB**, headroom ≈ 0.25 vCPU / 1216 MiB.
- DB pools unchanged. Per picker page: 2 statements (+1 HTTP and 2 inventory statements for fromStock). Per apply:
  - 1 lock statement (≤ 2,000 rows);
  - 1 bulk bucket update per bucket;
  - ≤ 2 statements per alloc table.

  This stays within `WRITE_TX` 4 s for 200 lines × 10 rows (to be measured).
- Memory: ≤ 2,000 candidate rows (~0.5 MiB of JS objects) per apply. The internal consumption result is ≤ 2,000 allocation rows (~150 KiB JSON). Keep the internal body cap at the current value unless measurement shows otherwise (BE-LOT-011).
- Generated column: the `memo_stock` / `stock` tables are rewritten once at migration. Expected size: thousands of rows, which takes seconds. Run it in the maintenance window of the deploy.
- **Measurements required before claiming fit:**
  - picker p95 with 20,000 available rows / 5,000 groups (target < 150 ms DB time);
  - apply p95 with 200 lot lines × 10 candidates (target < 1 s);
  - inventory RSS during a 200-key `stock/lots` call (target < 200 MiB).

## Infra / DevOps handoffs

No container, image, network, secret, volume, nginx route or build-context change. Existing internal routes and tokens are reused (`/internal/v1/master/*` with `MASTER_INVENTORY_SERVICE_TOKEN`, `/internal/v1/inventory/*` with `INVENTORY_MASTER_SERVICE_TOKEN`). **No infra or devops bundle is required.** The existing master and inventory pipelines build the change. Migrations are backend-owned.

## Stock ID visibility (owner Q-LOT-10, 2026-11-20)

Stock ID is a server-side ledger key only.

- Public tRPC/REST outputs (pickers, document `get`/`list`, Approve Center previews and search, Sale, Memo Outstanding) do not carry `stockId`, `stockIds` or allocations. Search does not match Stock ID (Q-LOT-10a).
- Allocation rows keep `stock_id` snapshots for audit, and internal service-to-service payloads still carry them (hold PUT, `stock/lots`, Sale consumption result).
- Memo Receive and Load to Stock still issue Stock IDs (ADR-0034 D3, ADR-0052 D5). Whether their pages and the vendor report still show them is Q-LOT-17/18. Until answered, their public outputs are unchanged and FE-LOT-009 is blocked.
