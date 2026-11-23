# SA decisions: inventory / sale-own-stock, SA revision 1

- Feature ID / SA revision / source UI: `sale-own-stock` / **1** / the approved [Sale UI revision 1](../../../frontend/sale/ui-spec.md) plus the [UI addendum A](#ui-addendum-to-sale-ui-revision-1) below (no new full UI spec)
- Status: **pending-review (Proposed)**. The owner's direct instruction of 2026-11-23, relayed by the parent ("หน้า sale From Stock ยังไม่ได้ต่อกับ load"), authorizes the chain SA -> backend -> frontend with no approval stop; the open questions below take their defaults. The parent records `sa-approved-*` in the [TODO](../../../../task/todo/sale-own-stock.md).
- ADR: [ADR-0058](../../../../adr/0058-sale-own-stock-from-load-to-stock.md) (Proposed). Refines [ADR-0054](../../../../adr/0054-sale-document.md) D11 and [ADR-0055](../../../../adr/0055-lot-based-stock-picking-and-allocation.md) D5/D7.
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Main flow: [diagram/sale-own-stock-flow.md](../../../../diagram/sale-own-stock-flow.md). TODO: [task/todo/sale-own-stock.md](../../../../task/todo/sale-own-stock.md) (BE-SO-*, FE-SO-*).
- Reused designs (unchanged): [inventory/sale](../sale/decisions.md) (document, approval, saga, photos, totals), [shared/lot-based-stock](../../shared/lot-based-stock/decisions.md) (lot key, FIFO D5, lot pickers), [inventory/load-to-stock](../load-to-stock/decisions.md) (own stock, holds D18), [inventory/stock-card](../stock-card/decisions.md) (kind registry D4/D11), [inventory/stock-value](../stock-value/decisions.md).
- Inspected code (2026-11-23): `backend-api-inventory/src/modules/sale/{service,prepare,repository,schemas,routes,read}.ts`, `src/modules/stock/{holds,stock,lots,picker,card-kinds,card}.ts`, `src/internal/master-routes.ts`, `src/platform/{master-api,sync/saga}.ts`, `prisma/schema.prisma`, migrations `20261117100000_inventory_init`, `20261118100000_stock_holds_phase2`, `20261119090000_sale`, `20261120090000_lot_based_stock`, `20261121090000_own_lot_key_per_stock`, `20261123090000_stock_card`, `20261123110000_stock_value` (uncommitted); `backend-api-master/src/inventory-internal/{sale-reads,sale-consumption,allocation}.ts`, `src/trade-document/{lot-stock.service,lot-key,reserve.service}.ts`, `src/master/router.ts`, `prisma/schema.prisma` (`ReserveLine`, `ReserveLineAlloc`); `frontend/src/features/sale/**`, `frontend/src/features/trade-document/{memo-stock-modal,from-stock-api,lot-stock}.ts(x)`; INV-20261121-002 (R2-F1).

## What exists and what is missing (the answer to "why is From Stock not connected")

| Piece | State today | This revision |
|---|---|---|
| Own stock rows and buckets | `inventory.stock` (Load to Stock). `lot_key = OS+id`. `sold` bucket and CHECKs exist | consumed `on_hand → sold` |
| Sale line source | `RESERVE`, `STOCK` (= Memo Stock); `OWN_STOCK` reserved for phase 2 | `OWN_STOCK` added |
| Sale picker | master `fromStock.lots` with a client-side `memoOnly` filter | inventory `GET /sale/stock-lots`, own first, then Memo Stock |
| Allocation record | `sale_line_alloc` (Memo Stock copy of master's result) | gains own-stock rows (authoritative) |
| Ledger kinds | `LOAD_*`, hold kinds; no sale kind | `SALE_OUT`, `SALE_OUT_REVERSAL` + `CARD_KINDS` rows |
| Reserve own-stock lines | cannot be sold (picker excludes them) | listed and consumed (phase B) |

## Decisions that answer the request

### 1. Sale from own stock (line shape, allocation, caps, refusal, concurrency, idempotency)

- **Line shape.** `source` ∈ `RESERVE | STOCK | OWN_STOCK`. Mapping of the request's words: `OWN_STOCK` = own stock from Load to Stock; `STOCK` = Memo Stock (the "MEMO_STOCK" of the request; the stored and contract value is unchanged to keep existing documents and the master call valid); `RESERVE` = a Reserve line over Memo Stock **or** own stock. An `OWN_STOCK` line carries `lotKey` (`OS…`/`OL…`), `stockCount`, the stone snapshot, `loadId` / `loadDocNo` (newest Load of the lot), `capPcs` / `capWeightCt` (available at Save), `pcs`, `weightCt`, `unitPrice`, discount and note like the other lines. It has no `memoStockId`, no `reserveLineId` and `stock_id = ''`.
- **Allocation table: reuse `sale_line_alloc`.** It already holds "what the applied revision took, per line and per stock" for Memo Stock. It gains `own_stock_uuid` (FK `inventory.stock`), `memo_stock_id` becomes nullable and an exactly-one CHECK keeps the two kinds apart. One extension, no second table. Own-stock rows are **authoritative** (void and delete reverse exactly these rows), not a copy: they are written by inventory itself when the Sale completes, and the master-copy writer is limited to `memo_stock_id IS NOT NULL` rows. The origin of a row (on-hand vs reserved) follows the line source (`OWN_STOCK` → on-hand, `RESERVE` → reserved), so no origin column. `stock_hold` rows of type `sale` are **not** written (they are unique per (document, stock), which breaks when one Sale takes one stone through an own line and a Reserve line); `loadHolders` reads `sale_line_alloc` instead so a Load still lists "Sale SL-…" as its holder.
- **Caps.** At Save: pcs ≤ available pcs and weight ≤ available weight of the lot, where available = Σ `on_hand` of the ACTIVE stocks of the lot plus **this Sale's own applied quantity** on that lot (edit of an applied Sale). Violation → `422 VALIDATION_ERROR` `lines.N.pcs|weightCt exceeds_pending` with `params {availablePcs, availableWeightCt}` (the code Memo Stock lines already use, so the browser mapping is unchanged). The cap is re-checked authoritatively under lock at apply (below).
- **Over-consumption refusal.** At apply, after locking the stocks, the planner computes per line the FIFO allocation. A lot short in pcs **or** weight → `409 SALE_SOURCE_SHORT` with `fieldErrors lines.N.pcs|weightCt exceeds_pending` and the available quantity; the transaction rolls back, nothing is recorded (approval ON: the Sale stays PENDING_APPROVAL at the same version; approval OFF: no Sale is created or changed). A lot above 500 stocks → `422 STOCK_LOT_TOO_LARGE`.
- **Concurrency.** The apply locks `stock` rows `FOR UPDATE` in `id` order in one statement (old allocation ∪ candidates), the same lock order as `applyHolds` for Reserve / Memo Out holds, so Sale and the master documents queue instead of deadlocking. READ COMMITTED re-reads the locked rows, so two Sales of the last 3 pcs give one success and one `SALE_SOURCE_SHORT`. A stock whose Load is `SYNCING` (a Load edit in flight) → `409 SALE_STOCK_BUSY` (retry-after 5), the analogue of `STOCK_HOLD_BUSY`. The Sale row itself is serialized by the existing guarded `UPDATE … WHERE version = expectedVersion AND sync_state = 'IDLE'`.
- **Idempotency.** Same unit as the Memo Out hold path, `(document, revision)`, but the document is the Sale and the revision is the op: `sale_sync_op (sale_id, revision)` is unique and carries the request hash; a retried HTTP call after `503 SYNC_PENDING` continues the same op; the own-stock delta is committed **in the same transaction as the op row**, so it can neither be lost nor applied twice. A replayed op never re-runs tx0. Own-only Sales (no op row) are protected by the guarded version update: a repeated approve of the same `expectedVersion` fails with `SALE_CHANGED` / `SALE_STATUS_INVALID` before touching stock.

### 2. Reserve interplay (how Memo Stock works now, and the own-stock equivalent)

Today (Memo Stock): Reserve Approve moves Memo Stock `pending → reserved`. A Sale From Reserve line consumes the Reserve line's **open** quantity (`qty − sold`): master adds `reserve_line.sold += q` and moves `memo_stock.reserved −= q, sold += q`, never touching another document's hold in the shared `reserved` bucket. The Reserve stays APPROVED and becomes "used" (`RESERVE_IN_USE` blocks its auto-approved edit/delete); deleting an auto-approved Sale releases the quantity back.

Own stock, kept consistent:

- **From Stock never sees held stones.** A Reserve moves `on_hand → reserved` (and Memo Out `on_hand → memo_out`); the lot read and the Sale cap use `on_hand` only, so stones held by a Reserve are not available to a From Stock line. Good test: reserve 2 of 5, From Stock shows 3.
- **From Reserve consumes the hold.** Master's search, prepare and consumption accept own-stock Reserve lines (phase B). Master settles `reserve_line.sold` and `reserve_line_alloc.settled` (oldest seq first, ADR-0055 D5) and returns the per-Stock-ID rows. Inventory completes in tx1: stock `reserved −= q, sold += q`, `stock_hold(reserve, R, S) −= q`, ledger `SALE_OUT −q`, allocation rows `(line, stock)`. Release reverses all four.
- **No cross-document damage.** A Reserve line's `q` can only be taken from its own hold, so another Reserve's or a Memo Out's hold on the same stone is never consumed.
- **Why tx1 and not tx0.** The Stock IDs of a Reserve line are master's allocation; inventory learns them from the master response. The quantities cannot be short there by invariant (hold ≥ open ≥ requested, both checked under lock by master and re-checked by inventory); a mismatch is a bug and surfaces as `SALE_OWN_ALLOCATION_DRIFT` (op stays CONFIRMED, retried, logged).
- **Unsold remainder** stays reserved until a later Reserve revision releases it (the same open item as Q-RS-03 for Memo Stock).

### 3. Procedures and endpoints that change

See [api-contract](api-contract.md). Summary: **new** `GET /api/inventory/v1/sale/stock-lots` (sale:VIEW; replaces the Sale use of master `fromStock.lots`); **changed** `POST/PUT /sale` and `GET /sale/{id}` (`OWN_STOCK`, `lotKey` `O*`, `load` reference, `allocated`), `GET /sale/reserve-lines` (own-stock Reserve lines); **master internal new** `POST /internal/v1/inventory/sale/memo-lots`; **master internal additive** `sale/prepare` / `sale/reserve-lines/search` / `PUT sale-consumptions` (own-stock Reserve lines, allocation `source: "OWN_STOCK"`, busy refusal); **master public** `fromStock.lots` loses `sale` (after the frontend switch). The R2-F1 finding is closed by D6 of the ADR: Sale no longer needs master's `fromStock.lots`, so it is removed from its grant list; Sale's own read is authorized by `sale:VIEW` only, never by quotation, reserve or memo-out.

### 4. Master / inventory boundary and the merge (own first)

Own stock is inventory-local: the lot read, the cap check at Save, the lock and the consumption never leave inventory. Memo Stock lives in master: the picker takes one master call per page (`sale/memo-lots`, token-authenticated like every master internal call), Save and Submit take the existing `prepare` call (no change for Memo Stock), Approve takes the existing consumption PUT. The merge is inventory's: the page returns own groups first (ordered newest Load date DESC, `lot_key` DESC), then Memo Stock groups (master's order); the cursor is the opaque section cursor already used by `fromStock.lots` (`<date>|<lotKey>` while in own stock, `m:<cursor>` once in Memo Stock); the memo page is read only when the own page is not full. The code of [master `fromStockLots`](../../../../../backend-api-master/src/trade-document/lot-stock.service.ts) is the model, with the two sources swapped.

### 5. Price and amount

The unit price stays user-entered. Rows carry `salePrice` (the lot's `stock.sale_price`, company currency, per `priceUnit`; own stock only; `null` for Memo Stock). The browser prefills `salePrice ÷ exchangeRate` rounded to 2 dp half-up when the Sale currency is not the company currency, and `salePrice` as is when it is. Default: prefill if present (> 0); the field stays editable and required > 0; if the rate is not set at pick time the prefill is skipped (empty), and a later rate change does not rewrite a price the user may have typed. The server never trusts the prefill: Save validates `unitPrice > 0` and computes every amount ([totals](../sale/architecture.md)).

### 6. Schema

[database-diagram](database-diagram.md): migration `20261123120000_sale_own_stock` (later than Stock Value's `20261123110000_stock_value`), rollback script, no backfill (nothing exists yet).

### 7. Stock Card and Stock Value

- **Registry rows** (`backend-api-inventory/src/modules/stock/card-kinds.ts`, BE-SC-102 note): `SALE_OUT: { documentType: "sale", effect: "MOVEMENT" }` and `SALE_OUT_REVERSAL: { documentType: "sale", effect: "MOVEMENT" }`. `DOCUMENT_TYPES.sale` already exists (label Sale, `stockIdVisible: true`, source `HOLD`). UT-SC-02 (every ledger kind classified) passes only with these rows.
- **Meaning of the delta.** `SALE_OUT.pcs_delta = −q` is the change of **book stock** (`on_hand + reserved`), so the Stock Card invariant `Σ card deltas = on_hand + reserved` holds for both origins (on-hand: `on_hand −q`; reserved: `reserved −q`).
- **Stock Card row.** One row per Sale and card: type caption "Sale", the Sale number as a link to `/sale/sale/{id}` (the route map already has `sale`), the **document date** and the **customer name** as account (from `stock_hold_document` written by the Sale; CASE `source: HOLD`), OUT = net sold quantity, Stock ID shown (registry unchanged, SQ-SO-07). A Sale that is edited back to the original or deleted nets to zero and has no row.
- **Balance and value.** The card balance and Stock Value's remaining quantity and amount fall by the sold quantity from the Sale's document date. The "Last sale" price of the stone becomes the price of this Sale's line (approved, not provisional, not deleted; `sale_line.item_key` is generated for every line, so no change). Stock Value's `CURRENT` reads the `stock` buckets, which already moved.

### 8. Frontend and testing

See [UI addendum](#ui-addendum-to-sale-ui-revision-1) and [testing](testing.md). TODO rows: [BE-SO-001…011, FE-SO-001…006](../../../../task/todo/sale-own-stock.md).

## UI addendum to Sale UI revision 1

The frontend change is small: the shared lot dialog (`MemoStockModal`, same title "Add From Stock", same columns, same footer) lists **our stock first, then Memo Stock**, from `GET /sale/stock-lots`, with no `memoOnly` restriction. Sections of the approved [Sale ui-spec](../../../frontend/sale/ui-spec.md) it touches (the parent or `ui-spec` role may fold the text in later; frontend follows this addendum now):

| ui-spec section | Change |
|---|---|
| F-01 / Source quality | own stock is now connected (phase 2 of Q-SL-01 realised) |
| T-03 From Stock button | opens the same dialog, now both sources; still not tied to customer or currency |
| T-09 row panel | own-stock row: "Available x pcs / y ct" (same cap word as Memo Stock); Sale Price prefilled when the lot has one |
| Item table, first column and Location | no Stock ID on `OWN_STOCK` and `STOCK` lot rows (lot shown); small source line "from {Load No.}" (own stock); Location = the Location Master name (already specified for phase 2) |
| P-02 Add From Stock | **our stock section first, then Memo Stock, in one list (no tabs)** exactly like the Quotation / Reserve / Memo Out dialog; the "Our stock is unavailable" notice becomes "Memo Stock is unavailable" (own stock is local; master down degrades the memo part); lots already on the document are left out; toast "Added N items from Stock" |
| Interaction and data | Approve/Save of a Sale moves own stock `on_hand → sold` (Reserve lines: `reserved → sold`); error texts `SALE_STOCK_BUSY`, `SALE_RESERVE_BUSY` |
| Out of scope (revision 1) | "Own stock in From Stock" is removed from the list |
| P-01 From Reserve | rows of own-stock Reserve lines appear (phase B); the Stock ID shown is the Reserve line's own value where it has one |

No new colours, tokens, icons, components, packages or routes.

## Owner questions

Approving "with the defaults" (or the owner instruction above) accepts each default.

| ID | Question | Recommended default | Alternative |
|---|---|---|---|
| SQ-SO-01 | Include **own-stock Reserve lines** in From Reserve in this revision (phase B)? | **Yes**, ordered after phase A (rows BE-SO-007/008, FE-SO-004), so a reserved own stone can be sold from its Reserve | Phase A only; reserved own stones are sold by deleting the Reserve first |
| SQ-SO-02 | Show the Stock ID on the picker and the Sale line for own stock? | **No** (hidden like the other lot pickers; stored server-side; Reserve lines unchanged) | Show it (a one-line column change; the lot is one Stock ID this round) |
| SQ-SO-03 | Prefill the Sale unit price from the lot's Sale Price? | **Yes, editable**: `salePrice ÷ Selling Rate`, 2 dp, only when present | Always empty (as Memo Stock) |
| SQ-SO-04 | May an own-stock-only Sale be approved while master is down? | **Yes** (local-only fast path, D4) | Always go through master |
| SQ-SO-05 | Where is the Sale lot read hosted? | **Inventory** `GET /sale/stock-lots` | Reuse master `fromStock.lots` and only drop `memoOnly` (fewer rows to build, keeps R2-F1 open, no price prefill field) |
| SQ-SO-06 | Record cost of goods sold in the ledger (`cost_delta_base`)? | **No**, 0 as every hold kind (cost stays on the stock row; the Sale Report module will compute margin) | Write `−unit_cost_base × quantity` on `SALE_OUT` |
| SQ-SO-07 | Show the Stock ID on the Stock Card row of a Sale? | **Yes** (registry unchanged; the owner hides it only on five types) | Hide it (`DOCUMENT_TYPES.sale.stockIdVisible = false`) |
| SQ-SO-08 | May an auto-approved own-stock Sale be edited or deleted after Save? | **Yes**, as SQ-SL-02; nothing "uses" an own-stock Sale yet (no purchase rule applies), later Receivable / return modules add their rule | Read-only after Save |
| SQ-SO-09 | Several Stock IDs behind one lot line (merged own lots, later) | Allocation rows already support it (FIFO, several rows per line); **not exercised this round** (own lot = one stock) | n/a |
| SQ-SO-10 | Can a Sale take own stock held by another customer's Reserve? | **No**: held stock is not on-hand; only that customer's From Reserve line can sell it | n/a (Memo Stock behaves the same) |
| SQ-SO-11 | Sale currency vs company currency of own stock | **No restriction** (own stock is not tied to a currency in From Stock, like Q-RS-06); only the prefill uses the rate | Refuse mixed currencies |
| SQ-SO-12 | Restore of a deleted own-stock Sale | **DRAFT, nothing applied** (SQ-SL-03 unchanged) | n/a |

## Reconciliation with the request

All eight points of the request are answered above: 1 (§1), 2 (§2), 3 (§3 and api-contract), 4 (§4), 5 (§5), 6 (§6, database-diagram), 7 (§7), 8 (testing, error-handling, the TODO and the UI addendum).
