# Backend verification: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review). Standard: [automated-testing](../../../../workflow/automated-testing.md): unit and integration tests for every added or changed function, module and API, including untested code that is fixed. Suites run to pass before handoff; commands and results are recorded under "Results" when the work is done.
- Test data: the existing inventory integration harness (real PostgreSQL schema `inventory`, `vitest`); the master suites for the master rows. A Load of stones is created through the Load to Stock service helpers (not raw SQL) so `lot_key`, `ref_doc_*` and the ledger are real.

## Automated coverage

### Inventory (`backend-api-inventory`)

| ID | Level | Case | Covers |
|---|---|---|---|
| UT-SO-01 | unit | `planOwnConsumption`: one lot of one stock; pcs and weight separately; exact fit; short in pcs only; short in weight only; zero quantity line is rejected earlier | BE-SO-002 |
| UT-SO-02 | unit | FIFO over several stocks (oldest ref date first, then Stock ID); a line spanning three stocks produces three rows with ascending `seq`; pcs and weight can land on different stocks | BE-SO-002 |
| UT-SO-03 | unit | increase takes the next free quantity and keeps earlier rows; decrease releases the newest rows first; removal releases all; unchanged line yields no delta | BE-SO-002 |
| UT-SO-04 | unit | refusal order: lot gone (reference invalid) → Load syncing (busy) → short; per-line `fieldErrors` with `availablePcs` / `availableWeightCt`, ≤ 50 | BE-SO-002 |
| UT-SO-05 | unit | movement rows: sign, kind (`SALE_OUT` / `SALE_OUT_REVERSAL`), two rows when pcs and weight move opposite, none for a zero delta; `cost_delta_base = 0` | BE-SO-002 |
| UT-SO-06 | unit | `masterNeeded` truth table (own-only, mixed, last master line removed on UPDATE, DELETE, Restore → nothing applied) | BE-SO-003 |
| UT-SO-07 | unit | schema rules: source / reference matrix (`OWN_STOCK` + `O*`; `STOCK` + `O*` refused; both ids; `reserveLineId` on a stock line; duplicate lot); regex of `OS…` / `OL…` | BE-SO-003 |
| UT-SO-08 | unit | normalize: cap = available + own applied; snapshot copied from the local read, `stockId = ''`, `loadId` / `loadDocNo` set; `exceeds_pending` fieldErrors | BE-SO-003 |
| UT-SO-09 | unit | cursor: own section `date|lotKey`, memo section `m:`, invalid cursor / calendar date → 422 `cursor invalid`; page fill (own full → no master call; own partial → memo `limit − own`) | BE-SO-004 |
| UT-SO-10 | unit | `CARD_KINDS` has both new kinds as `sale` / `MOVEMENT`; **UT-SC-02 stays green** (every kind in `stock_movement_kind_check` is classified) | BE-SO-002 |
| UT-SO-11 | unit | reserve settlement delta (phase B): per `(line, stock)` before / after; drift detection; re-insert of a deleted hold row | BE-SO-008 |
| IT-SO-B01 | integration | Load 5 pcs, Sale (approval OFF) of 2: stock `on_hand 3 / sold 2`, `pcs = Σ buckets`, one `SALE_OUT −2` row, allocation row, `stock_hold_document` header with date and customer, no op row, no master call (master client stubbed to throw) | D3/D4 |
| IT-SO-B02 | integration | approval ON: Save → DRAFT (nothing moves); Submit; Approve moves stock; a second Approve with the same version → `SALE_CHANGED`; stock moved once | D4 |
| IT-SO-B03 | integration | **short at apply:** Save 3, another document takes 2, Approve → `409 SALE_SOURCE_SHORT`, the Sale stays PENDING at the same version, nothing in the ledger | D3 |
| IT-SO-B04 | integration | **concurrency:** two Sales approve the last 3 pcs at once: one APPROVED, one `SALE_SOURCE_SHORT`, `sold = 3`, no negative bucket, no deadlock (run 50 times) | D3 |
| IT-SO-B05 | integration | concurrency with a Reserve / Memo Out hold on the same stock: both orders complete, buckets consistent, `pcs = Σ buckets`; held stones are not offered or consumed | D2 |
| IT-SO-B06 | integration | **edit down** (3 → 1) of an auto-approved Sale releases the newest rows, writes `SALE_OUT_REVERSAL +2`, rewrites the allocation; edit up takes the next FIFO stock; edit that only changes date / customer updates the `stock_hold_document` header | D3/D9 |
| IT-SO-B07 | integration | **delete** of an auto-approved Sale: all quantity back on hand, ledger nets to zero, allocation rows removed, soft-deleted Sale; Restore → DRAFT, nothing applied | D3 |
| IT-SO-B08 | integration | **mixed Sale:** own line + Memo Stock line; master stub refuses `EXCEEDS_AVAILABLE` → own stock reversed in the same transaction, op `REFUSED`, ledger `SALE_OUT` + `SALE_OUT_REVERSAL`, error mapped to `SALE_SOURCE_SHORT` on the Memo Stock row | D4 |
| IT-SO-B09 | integration | mixed Sale, kill between tx0 and master, and between master and tx1: the re-drive (`redriveIfStale`, sweep, `sync:redrive`) ends in one consistent state (own sold once; allocation written once) | D4 |
| IT-SO-B10 | integration | master down: own-only approve succeeds; mixed approve → `503 SYNC_PENDING` and later completes after master returns | D4 |
| IT-SO-B11 | integration | Load edit in flight (`load_to_stock.sync_state = SYNCING`) → `SALE_STOCK_BUSY`; a Load edit/delete of an in-use stock is refused by the Load (`LOAD_TO_STOCK_IN_USE`) and `holders` lists the Sale | D3 |
| IT-SO-B12 | integration | **Stock Card:** a Load of 4, a Sale of 2 → rows IN 4 (Load) / OUT 2 (Sale, number, doc date, customer name, link id) balances 4, 2; list balance 2; the Sale deleted → one row; `Σ card deltas = on_hand + reserved` (invariant test of ADR-0056) for both origins | D9 |
| IT-SO-B13 | integration | **Stock Value:** remaining quantity and amount fall by the sold quantity; "Last sale" of the stone becomes the Sale's unit price (approved, not deleted, not provisional) | D9 |
| IT-SO-B14 | integration | **picker:** own first then memo (master stub), cursor continues into `m:`; held / sold stones excluded; search by lot, stone, stone code, cer no., Load number; **no Stock ID, cost, vendor, price** in any row (`JSON.stringify` scan); `salePrice` present for own, `null` for memo; master failure → `memoStock: "UNAVAILABLE"` with own rows | D6/D7 |
| IT-SO-B15 | integration | Save caps: pcs > available → `exceeds_pending`; edit of an applied Sale counts its own quantity; lot gone → `SALE_REFERENCE_INVALID`; > 500 stocks → `STOCK_LOT_TOO_LARGE` | D2 |
| IT-SO-B16 | integration | **phase B:** own Reserve of 2 pcs, Sale From Reserve of 1: master stub returns the OWN_STOCK allocation; stock `reserved 1 / sold 1`, `stock_hold(reserve)` 1 (row deleted at 0), `SALE_OUT −1`; delete the Sale → all restored incl. the re-inserted hold; Reserve edit / delete refused as in use | D5 |
| IT-SO-B17 | integration | phase B drift: hold below the settlement → op stays `CONFIRMED`, `SYNC_PENDING`, error logged, nothing partially applied (tx1 rolled back) | D5 |
| IT-SO-B18 | integration | N+1 budgets (query counter): own step ≤ 6, completion ≤ 3, reserve settlement ≤ 6, picker ≤ 2 + 1 call, detail of an own-only Sale makes 0 master calls, for 1 and for 200 lines | D11 |
| IT-SO-B19 | integration | migration up / down: the rollback script refuses with an own-stock line, allocation or `SALE_OUT*` row; succeeds on an empty database; existing Memo Stock allocation rows keep `own_stock_uuid IS NULL` | D10 |
| IT-SO-A1 | integration | picker: no cookie 401; no `sale:VIEW` 403 with `details.required`; `quotation` / `reserve` / `memo-out` VIEW alone → 403; auth unavailable → 503 fail closed | authorization |
| IT-SO-A2 | integration | picker query validation: unknown key, `limit` 51, bad dates, `q` 101 chars, bad cursor → 422; `LIKE` metacharacters escaped | authorization |
| IT-SO-A3 | integration | no CSRF needed on the GET; `Cache-Control: no-store` | contract |
| IT-SO-A4 | integration | grants of writes: ADD / EDIT / APPROVE / DELETE enforced for `OWN_STOCK` documents as for other lines | authorization |
| IT-SO-A5 / A6 | integration | a `sale`-only principal can pick, Save, Submit; an approver without `sale:VIEW` cannot approve; DELETE needed to release | authorization |

### Master and frontend

| ID | Level | Case |
|---|---|---|
| IT-SO-M1 | master integration | `POST /internal/v1/inventory/sale/memo-lots`: token required, strict body, ≤ 4 KiB, pending bucket only, price / vendor / amount fields null, keyset cursor, ≤ 4 in flight (BE-SO-006) |
| IT-SO-M2 | master integration | From Reserve search and prepare list open own-stock Reserve lines (customer and currency match), exclude closed / deleted / other customer (BE-SO-007) |
| IT-SO-M3 | master integration | consumption of an own-stock Reserve line: `reserve_line.sold`, `reserve_line_alloc.settled` oldest first, allocation rows `source OWN_STOCK`, replay idempotent on revision + hash, `RESERVE_BUSY` while the Reserve's hold sync is in flight, release restores; Memo Stock paths unchanged (existing suites pass) |
| IT-SO-M4 | master integration | after BE-SO-009: `fromStock.lots` refuses a `sale`-only principal (403) and still serves quotation / reserve / memo-out |
| UT-FE-SO-01 | frontend unit | `lotToSaleLine`: own item → `saleSource "OWN_STOCK"`, `lotKey` kept, `stockId ""`, source line "from {Load No.}", cap word "available"; Memo Stock item unchanged |
| UT-FE-SO-02 | frontend unit | price prefill helper: `salePrice ÷ rate` 2 dp half-up, company currency as is, no rate → empty, 0 / null → empty, never overwrites a typed price |
| UT-FE-SO-03 | frontend unit | request mapping: `OWN_STOCK` sends `{source, lotKey}` only; `STOCK` / `RESERVE` unchanged; error mapping of `SALE_SOURCE_SHORT` own rows, `SALE_STOCK_BUSY`, `SALE_RESERVE_BUSY` |
| IT-FE-SO-01 | frontend integration | From Stock dialog on the Sale binding: own rows first, then Memo Stock, no Stock ID, "Memo Stock is unavailable" notice with own rows pickable, load more continues the cursor, picked lots are excluded, OK adds rows with prefilled price |
| IT-FE-SO-02 | frontend integration | approve of a Sale with an own-stock line shows the short-stock message on the right row (`lines.N.pcs`) |

## Manual / measurement (results recorded, not claimed in advance)

| ID | Check | Target |
|---|---|---|
| PF-SO-01 | picker own part with 5,000 open stocks / 5,000 lots, `q` search | p95 ≤ 150 ms; plan uses `stock_lot_open_idx` |
| PF-SO-02 | approve of a 200-line own-stock Sale (fast path) | p95 ≤ 700 ms, ≤ 6 + 3 statements, inventory RSS growth ≤ 30 MiB, pool never exhausted |
| PF-SO-03 | lot of 500 stocks refused cleanly; 50 concurrent approves of distinct Sales on distinct stocks | no deadlock, p95 ≤ 1.5 s |
| TC-SO-01…10 | manual-tester script on the Sale page: pick own stock (first section, no Stock ID, price prefilled), Save, Approve, Stock Card OUT row and link, delete returns the stones, short-stock message when another user took them, reserved stones are not offered but sellable From Reserve (phase B), master stopped (own-only Sale still approves) | customer report under `document/testing/user-check/` |

## Security review before handoff

One pass of `sec-auditor` and one of `security-auditor` on the same final source revision of the backend (and frontend) changes (BE-SO-011 / FE-SO-006); findings enter `document/task/investigation/` once. Focus: the new read's grant and data exposure (R2-F1 closure), the lot-key trust boundary, lock order and the compensation path, the master internal route, and that no Stock ID or cost reaches a response or log. Approved ADR / TODO documents are not reviewed again.

## Service acceptance

1. The ADR acceptance checks pass against a real database.
2. Every row above passes; the full inventory suite, the touched master suites and the touched frontend suites pass; typecheck and lint of the touched files are clean.
3. N+1 and PF evidence recorded; the Compose total is unchanged (1.75 vCPU / 2880 MiB).
4. The Stock Card invariant test and UT-SC-02 pass with the new kinds.
5. The frontend integrates against the live contract (FE-SO-001/002/003) before FE-SO-005 is closed.

## Results

Not run (design only). Backend and frontend record commands and results here when implemented.
