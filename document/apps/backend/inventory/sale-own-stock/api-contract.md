# API contract: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review). Base contract: [inventory/sale api-contract](../sale/api-contract.md); lot row shape: [lot-based-stock api-contract](../../shared/lot-based-stock/api-contract.md) (`LotGroupRow`). This file lists only the **delta**.
- Public base: REST `/api/inventory/v1` (cookie auth, CSRF on writes, `no-store` on the read). Internal: `/internal/v1/inventory/*` on master (token `INVENTORY_MASTER_SERVICE_TOKEN`) and `/internal/v1/master/*` on inventory (unchanged).
- Consuming TODO IDs: FE-SO-001…006; BE-SO-001…011 ([TODO](../../../../task/todo/sale-own-stock.md)).
- Compatibility: every change is additive. Existing documents, the `STOCK` / `RESERVE` sources, master consumption v1/v2 and `fromStock.lots` keep working; `fromStock.lots` loses the `sale` grant only in BE-SO-009 after the frontend switched.

## Shared types

```ts
type Source = "RESERVE" | "STOCK" | "OWN_STOCK";           // STOCK = Memo Stock (name unchanged); OWN_STOCK = new
type Dec = string;                                          // decimal string; pcs are integers

/** One row of the From Stock dialog: lot-based-stock LotGroupRow, price / vendor never filled, one Sale-only field. */
type SaleLotRow = {
  lotKey: string;                                           // "OS<uuid>" / "OL<md5>" own stock; "MS…" / "ML…" Memo Stock
  source: "OWN_STOCK" | "MEMO_STOCK";                       // picker word; the Sale line source of MEMO_STOCK is "STOCK"
  lot: string; merged: boolean;
  stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string; location: string; itemNote: string;
  ref: { type: "LOAD" | "MEMO_RECEIVE"; id: string; docNo: string; docDate: string };
  refCount: number;
  pendingPcs: number; pendingWeightCt: Dec;                // own: Σ on_hand; Memo Stock: Σ pending
  priceUnit: "PER_CT" | "PER_PCS";
  unitPrice: null; netUnitPrice: null; amount: null; currency: null; vendor: null;   // always null for Sale (no price, no vendor)
  salePrice: Dec | null;                                    // own stock only: stock.sale_price, company currency per priceUnit; null for Memo Stock
  // never returned: stockId, stockIds, stock count of a group of one, cost, vendor
};

type SaleStockLotsPage = { items: SaleLotRow[]; nextCursor: string | null; memoStock: "OK" | "UNAVAILABLE" };
```

`SaleLine` (input) gains the third source; the discriminator rules of `saleRules`:

| `source` | exactly one of | forbidden | Notes |
|---|---|---|---|
| `RESERVE` | `reserveLineId` | `memoStockId`, `lotKey` | Reserve line over Memo Stock **or** own stock (phase B); the server resolves it |
| `STOCK` | `lotKey` (`M*`) or legacy `memoStockId` | `reserveLineId`, an `O*` lot key | unchanged |
| `OWN_STOCK` | `lotKey` (`OS…` / `OL…`, regex `^OL[0-9a-f]{32}$\|^OS[0-9a-f-]{36}$`) | `reserveLineId`, `memoStockId` | new; one `lotKey` once per document (`duplicate`) |

All other line fields (`pcs`, `weightCt`, `unitPrice`, `discount`, `itemNote`, `photoIds`, `id`) are unchanged. `unitPrice` stays required > 0 and user-entered; the server never derives it.

```ts
type LineOut = /* existing LineOut */ & {
  source: Source;
  lotKey: string | null;                                    // own and Memo Stock lot lines
  stockCount: number | null;
  sourceDoc: { type: "RESERVE" | "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string };   // LOAD = newest Load of an own lot (new)
  stockId: string;                                          // "" on every lot line (own and Memo Stock); Reserve lines unchanged
  allocated: boolean;                                       // existing; true when the applied allocation exists (own rows count)
  cap: { pcs: number; weightCt: Dec };                      // available at read time + this Sale's own applied quantity
};
```

## Public endpoints (inventory)

| Method / path | Permission | Input | Output | Notes / TODO |
|---|---|---|---|---|
| **`GET /sale/stock-lots?q=&from=&to=&location=&cursor=&limit=`** | `sale:VIEW` | `q` ≤ 100 (lot, stone, stone code, cer no., source doc no.; **never** a Stock ID), `from` / `to` ISO dates on the Load / Memo Receive date (`to ≥ from`, ≤ 366 days), `location` ≤ 40 optional (`memo` = Memo Stock only, another value = own stock in that Location Master name; omitted = both), `cursor` opaque ≤ 200, `limit` 1–50 (default 50). Unknown keys → 422 | `SaleStockLotsPage`. **Own stock first**, ordered (newest Load date DESC, `lot_key` DESC), **then Memo Stock** (master's order). The cursor is `YYYY-MM-DD\|lotKey` base64url in the own section and `m:<memo cursor>` in the Memo Stock section; invalid → 422 `VALIDATION_ERROR` `cursor invalid`. When the own page holds the full `limit` the memo page is not read; otherwise it fills `limit − own` rows. `memoStock: "UNAVAILABLE"` (and own rows only, status 200) when master fails or times out (2 s) | P-02. FE-SO-001/002, BE-SO-004 |
| `POST /sale`, `PUT /sale/{id}` | `sale:ADD` / `sale:EDIT` (unchanged) | `SaleInput` with `OWN_STOCK` lines | unchanged `201 { id, docNo, version, status }` / `{ id, version, status }` | ON → DRAFT (nothing moved); OFF → applied. Errors below |
| `POST /sale/{id}/submit`, `…/approve`, `…/delete` | unchanged | unchanged | unchanged | Approve / delete of an auto-approved Sale move stock |
| `GET /sale/{id}` | `sale:VIEW` | — | `SaleOut` with `LineOut` above | no master call for an own-only Sale |
| `GET /sale/reserve-lines` | `sale:VIEW` | unchanged | `ReserveLineRef[]` also lists open lines of own-stock Reserve lines (phase B) | `ReserveLineRef` gains `source: "MEMO_STOCK" \| "OWN_STOCK"`; for an own line `memoStockId = null`, `lotKey = "O…"` or `stockId` of the legacy line |

`GET /sale/stock-lots` never returns a hold-related field and never a row for stock whose only quantity is in `reserved`, `memo_out`, `sold` or `consumed`.

## Internal API

### Master → used by inventory (new / additive)

| Method / path | Input | Output | Rule |
|---|---|---|---|
| **`POST /internal/v1/inventory/sale/memo-lots`** (new) | `{ q?, from?, to?, cursor?, limit: 1–50 }` (strict, ≤ 4 KiB) | `{ items: LotGroupRow[] /* source MEMO_STOCK, pending bucket, unitPrice / netUnitPrice / amount / currency / vendor = null */, nextCursor }` | reuses master `memoLots({ bucket: "pending" })` and its keyset cursor; one statement; token + body cap + ≤ 4 in flight as the other inventory-internal routes; no actor needed |
| `POST /internal/v1/inventory/sale/reserve-lines/search`, `…/prepare` | unchanged | rows of own-stock Reserve lines, `source: "OWN_STOCK"` (phase B) | open = `pcs − sold`; status OPEN / CLOSED / UNAVAILABLE as for Memo Stock |
| `PUT /internal/v1/inventory/sale-consumptions/{saleId}` | unchanged. **Own `OWN_STOCK` Sale lines are not sent**; a RESERVE line over own stock is sent with `reserveLineId` only | `allocations[].rows[]` may carry `source: "OWN_STOCK"` with `stockUuid` (inventory `stock.id`), `stockId`, `pcs`, `weightCt` (consumed by this Sale) | settles `reserve_line.sold` and `reserve_line_alloc.settled_*` oldest first; new refusal `409 SALE_CONSUMPTION_RESERVE_BUSY {reserveLineIds}` when the Reserve's inventory hold sync is in flight; other refusals as today |
| `GET /internal/v1/inventory/sale-consumptions/{saleId}` | unchanged | unchanged (recovery read) | used by `recover` |

### Inventory → master-used internal (`/internal/v1/master/*`, unchanged)

`POST /stock/lots/available`, `POST /stock/lots`, `PUT /stock-holds/...` are unchanged; the Sale read uses the same SQL in-process (no HTTP) and never the holds route.

## Master public change

| Procedure | Change |
|---|---|
| `fromStock.lots` | grant list `permittedAny(["quotation", "reserve", "memo-out", "sale"], "VIEW")` → `["quotation", "reserve", "memo-out"]` (BE-SO-009, after FE-SO-002 ships). Closes R2-F1 of INV-20261121-002 |
| `reserve.get` | lines of own stock gain nothing new (`soldPcs` / `soldWeightCt` exist); Stock ID stays hidden for Reserve (owner) |

## Errors (inventory envelope `{ error: { code, message, requestId, details? } }`)

| Status | Code | When | `details` | Origin |
|---|---|---|---|---|
| 422 | `VALIDATION_ERROR` | bad shape; `lines.N.reference invalid` (wrong lot prefix for the source, both ids, `reserveLineId` on a stock line); `duplicate` lot; `lines.N.pcs|weightCt exceeds_pending` at Save (`params {availablePcs, availableWeightCt}`); `unitPrice required` | `fieldErrors` | Save |
| 422 | `SALE_REFERENCE_INVALID` | an own lot with no open stock (gone, taken, reserved, memo-out, load reversed); a Reserve line not open | `fieldErrors lines.N.reference unavailable` | Save, Submit, apply |
| 409 | `SALE_SOURCE_SHORT` | the lot is short at apply (own: local; Memo Stock / Reserve: master) | `fieldErrors lines.N.pcs|weightCt` code `exceeds_pending` (own, Memo Stock) or `exceeds_open` (Reserve) with `params` | Approve, auto-approved Save / Edit |
| 409 | `SALE_STOCK_BUSY` | a Load that owns the stock is `SYNCING` (edit in flight) | `{ retryAfterSeconds: 5 }`, `Retry-After: 5` | apply |
| 409 | `SALE_RESERVE_BUSY` | master `SALE_CONSUMPTION_RESERVE_BUSY` (phase B) | `{ retryAfterSeconds: 5 }`, `Retry-After: 5` | apply |
| 422 | `STOCK_LOT_TOO_LARGE` | a lot above 500 stocks or an apply above 2,000 | `{ lotKey?, limit }` | Save, apply |
| 503 | `SYNC_PENDING` | master unreachable / timed out / op `CONFIRMED` retrying (mixed Sales only) | `{ id, retryAfterSeconds: 5 }` | apply |
| existing | `SALE_CHANGED`, `SALE_BUSY`, `SALE_STATUS_INVALID`, `SALE_IN_USE`, `SALE_DELETED`, `SALE_NOT_FOUND`, `PERMISSION_DENIED`, … | unchanged | unchanged | — |
| internal only | `SALE_OWN_ALLOCATION_DRIFT` | tx1 found a Reserve hold or `reserved` bucket below the settlement | logged `inventory.sale_own_drift {saleId, revision}`; the caller sees `503 SYNC_PENDING` | phase B |

## Rules

- Own-stock availability is `on_hand` only. Anything in `reserved` / `memo_out` / `sold` / `consumed` is never listed and never consumable by an `OWN_STOCK` line.
- The lot key is validated by format and prefix before any query; the group is **re-derived from the database** at Save and at apply, never trusted from the client (as ADR-0055).
- `pendingPcs` / `pendingWeightCt` of a group are sums over the **whole** group, also when only some stocks matched the search.
- A Sale line's `cap` and the lot row's quantity are display aids; the lock-time check decides.
- Pagination is keyset only, `limit` ≤ 50, no total count.
- Idempotency: HTTP writes are guarded by `expectedVersion`; the saga op is keyed `(saleId, revision)`; the own-stock delta is atomic with the op row.
