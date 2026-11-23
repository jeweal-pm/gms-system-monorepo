# Sequence diagrams: lot-based stock (SA revision 1, approved 2026-11-20)

No gateway: the browser reaches Nginx, which proxies `/api/master/*` to `api-master:3201` (workspace `backend-api-master`) and `/api/inventory/*` to `backend-api-inventory:3301`. Internal calls go service to service on the `inventory-master` network.

## 1. Pick a lot (From Stock: Quotation / Reserve / Memo Out / Sale)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend (MemoStockModal, lot mode)
  participant NX as Nginx
  participant M as backend-api-master (fromStock.lots)
  participant PM as PostgreSQL partner
  participant I as backend-api-inventory (internal)
  participant PI as PostgreSQL inventory
  U->>FE: Add From Stock, search "L-01"
  FE->>NX: GET /api/master/trpc/fromStock.lots?q=L-01&limit=50
  NX->>M: proxy (cookie JWT, live authz VIEW any of quotation/reserve/memo-out/sale)
  par Memo Stock lots
    M->>PM: keys: GROUP BY lot_key HAVING any row matches ORDER BY max(date) DESC, lot_key DESC LIMIT 51
    M->>PM: aggregate for <=51 keys (sums, shared details incl. note, newest ref, no Stock IDs)
  and our stock lots (2 s)
    M->>I: POST /internal/v1/master/stock/lots/available (same filters, cursor, 51)
    I->>PI: same two statements on stock_lot_open_idx
    I-->>M: LotGroupRow[] (no cost / price)
  end
  M->>M: merge by (date DESC, lot_key DESC), take 50, nextCursor
  M-->>FE: items (one row per lot), ownStock OK
  alt inventory down or slow
    M-->>FE: Memo Stock lots only, ownStock UNAVAILABLE (notice + Retry)
  end
  U->>FE: tick lot, OK
  FE->>FE: add line {source, lotKey, snapshot, available}, user sets pcs/weight
```

## 2. Approve a Memo Out with Memo Stock lot lines (allocation FIFO)

```mermaid
sequenceDiagram
  autonumber
  actor U as Approver
  participant FE as Frontend
  participant M as backend-api-master (memoOut.approve)
  participant PM as PostgreSQL partner
  U->>FE: Approve MO-0012
  FE->>M: memoOut.approve {id, version}
  M->>PM: BEGIN, lock memo_out header FOR UPDATE, read lines
  M->>PM: SELECT open rows WHERE lot_key = ANY(keys) OR id = ANY(legacy) ORDER BY id FOR NO KEY UPDATE LIMIT 2001
  alt > 2000 rows or > 500 in one lot
    M-->>FE: 422 STOCK_LOT_TOO_LARGE (nothing changed)
  end
  M->>M: allocateFifo per line (ref date ASC, Stock ID ASC, pcs and weight)
  alt a line short (another document took the lot)
    M->>PM: ROLLBACK
    M-->>FE: 409 MEMO_OUT_PENDING_SHORT lines.N {lotKey, availablePcs, availableWeightCt}
  else enough
    M->>PM: UPDATE memo_stock pending -> reserved per Stock ID (existing bulk SQL over per-item totals)
    M->>PM: INSERT memo_out_line_alloc rows (seq, stock, qty)
    M->>PM: status APPROVED, notifications (existing), COMMIT
    M-->>FE: approved document (lot lines, no Stock IDs, allocated = true)
  end
```

Concurrent approvals of the same lot both lock the same rows in id order. The second waits, re-reads the pending quantity and either allocates the remainder or is short. The same holds for Reserve (pending → reserved), Memo Return (pending → returned) and Purchase (sold part first, then pending → sold + purchased).

## 3. Memo Out Return of part of a lot line (settle oldest first)

```mermaid
sequenceDiagram
  autonumber
  participant M as backend-api-master (memoOutReturn.approve)
  participant PM as PostgreSQL partner
  participant I as backend-api-inventory
  M->>PM: BEGIN, lock MOR header, lock memo_out_line rows FOR UPDATE (id order)
  M->>PM: lock memo_out_line_alloc rows FOR UPDATE (id order)
  M->>M: settleOldestFirst(q) over unsettled alloc rows (seq ASC)
  alt Memo Stock allocations
    M->>PM: memo_stock reserved -> pending per Stock ID, alloc.settled += , INSERT memo_out_return_line_alloc, memo_out_line.returned +=
    M->>PM: COMMIT
  else own-stock allocations (saga ADR-0052 D19, release part)
    M->>PM: tx1 as above for master rows, COMMIT
    M->>I: PUT stock-holds MEMO_OUT_RETURN per settled stock (unchanged API)
    I-->>M: applied (or re-drive on unknown outcome)
  end
```

## 4. Reserve with own-stock lot lines (pre-read → allocate → unchanged hold PUT)

```mermaid
sequenceDiagram
  autonumber
  participant M as backend-api-master (reserve.approve / auto-approved save)
  participant PM as PostgreSQL partner
  participant I as backend-api-inventory
  participant PI as PostgreSQL inventory
  M->>I: POST /internal/v1/master/stock/lots {lotKeys <= 200} (2 s)
  I->>PI: SELECT candidates FIFO per key (no lock, <= 500 each)
  I-->>M: groups with on_hand per stock
  M->>M: allocateFifo -> H_new per stock, split acquire / release (D19)
  M->>PM: tx0 SYNCING + inventory_sync_op (revision r)
  M->>I: PUT /internal/v1/master/stock-holds/RESERVE/{id} r = H_mid
  I->>PI: lock stocks FOR UPDATE id order, guard, move on_hand -> reserved, holds, movements
  alt refused: another document took the stock after the pre-read
    I-->>M: 409 STOCK_HOLD_EXCEEDS_AVAILABLE {stockId}
    M->>PM: op ended, IDLE
    M-->>M: map stockId -> lot line N: exceeds_pending "lot changed, refresh"
  else applied
    I-->>M: ok
    M->>PM: tx1 engine body + reserve_line_alloc (own_stock_id rows), hold_revision, COMMIT
    M->>I: release part PUT (if any) after commit
  end
```

## 5. Sale (inventory) From Stock lot line and From Reserve line

```mermaid
sequenceDiagram
  autonumber
  participant I as backend-api-inventory (Sale apply)
  participant PI as PostgreSQL inventory
  participant M as backend-api-master (internal sale-consumptions v2)
  participant PM as PostgreSQL partner
  I->>PI: tx0: sale SYNCING, sale_sync_op revision r
  I->>M: PUT /internal/v1/inventory/sale-consumptions/{saleId} {revision r, hash, lines: [{lotKey,q},{reserveLineId,q}]}
  M->>PM: BEGIN, lock sale_consumption, Reserve headers FOR SHARE, reserve lines + reserve_line_alloc FOR UPDATE, lot candidates FOR NO KEY UPDATE (id order)
  M->>M: delta vs stored consumption rows, allocateFifo (lot) / settleOldestFirst (reserve alloc) / release newest first
  alt short
    M-->>I: 409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE details.lines
    I->>PI: tx1': op failed, IDLE, user sees line errors
  else ok
    M->>PM: buckets per Stock ID (pending->sold, reserved->sold), sale_consumption_line per (sale,line,stock), result {allocations}, COMMIT
    M-->>I: result with allocations
    I->>PI: tx1: apply status, sale_line_alloc = result.allocations, IDLE
  end
  Note over I,M: unknown outcome -> re-drive same revision, master replays stored result (deterministic allocation)
```

## 6. Legacy document (no conversion)

```mermaid
sequenceDiagram
  autonumber
  participant FE as Frontend
  participant M as backend-api-master
  participant PM as PostgreSQL partner
  FE->>M: reserve.get (document saved before the change)
  M->>PM: lines (memo_stock_id set, lot_key NULL) + alloc rows (backfilled, 1 per applied line)
  M-->>FE: legacy line shown by Lot and details (no Stock ID), allocated = true
  FE->>M: reserve.update keeps the legacy line, adds a lot line
  M->>M: legacy line accepted only because it is already stored, new line must use lotKey
```
