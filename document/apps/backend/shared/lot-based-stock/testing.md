# Testing: lot-based stock (SA revision 1, approved 2026-11-20)

These tests follow [automated-testing](../../../../workflow/automated-testing.md): unit and integration tests for every changed module, query and API, run to pass before handoff.

## Unit (pure)

| ID | Subject | Checks |
|---|---|---|
| UT-LOT-01 | `lot-key` | regex / prefix per source; cursor encode/decode round trip; invalid input → `VALIDATION_FAILED` |
| UT-LOT-02 | `allocateFifo` | Σ = request; each ≤ row available; order (date, stock_id); pcs-only and weight-only requests; short returns available; deterministic (property test, 1,000 random cases) |
| UT-LOT-03 | `releaseNewestFirst` | gives back unsettled only, newest seq first; never below settled |
| UT-LOT-04 | `settleOldestFirst` | oldest seq first; never above qty − settled |
| UT-LOT-05 | Purchase lot split | SOLD exact sold-open; MERGED sold part first then pending; IN_STOCK pending only |

## Integration (master, real PostgreSQL)

| ID | Scenario | Expected |
|---|---|---|
| IT-LOT-01 | Generated key | Same lot (case/space variants) + same details → one key. Different color, price, vendor or location → different keys. Empty lot or cer no → `MS<id>`. |
| IT-LOT-02 | `memoStock.lots` / `fromStock.lots` / `purchase.memoStockLots` | One row per lot with sums and the newest ref; no `stockId`/`stockIds`/count in the response. Search by a Stock ID returns nothing (Q-LOT-10a); search by lot / stone / cer no. returns the whole lot. Rows differing only by item note or any price stay separate (Q-LOT-04). Keyset paging is stable across pages and across the master/inventory merge. Inventory down → `ownStock UNAVAILABLE`. ≤ 2 statements per side (query count assertion). |
| IT-LOT-03 | Memo Out approve of a lot (3 rows: 2/3/4 pcs, request 5) | rows 1+2 allocated (2 + 3); buckets per Stock ID; alloc rows seq 1..2 |
| IT-LOT-04 | Concurrent approve of two documents on one lot | One succeeds, the other is short with nothing changed; no deadlock (two parallel connections) |
| IT-LOT-05 | Auto-approved edit (approval OFF): raise then lower qty | raise allocates more FIFO, lower releases newest first; buckets back to the expected values |
| IT-LOT-06 | Memo Out Return of 2 pcs from a lot line | oldest alloc settled; reserved → pending on those Stock IDs; `memo_out_return_line_alloc` written; reversal on delete exact |
| IT-LOT-07 | Memo Return lot (vendor/currency) | pending → returned oldest first; vendor mismatch → 400 |
| IT-LOT-08 | Purchase SOLD / IN_STOCK / MERGED lot lines | purchased/sold per Stock ID equals the same purchase made per Stock ID; ADR-0043 CHECKs hold |
| IT-LOT-09 | Quotation lot | copies the snapshot, availability = group sum, holds nothing |
| IT-LOT-10 | `STOCK_LOT_TOO_LARGE` | 501 rows in a lot → 422, nothing changed |
| IT-LOT-11 | Legacy documents | after the migration, existing applied lines have 1 alloc row; get/approve/return/edit behave as before; a new item-id line → `lot_required` |
| IT-LOT-12 | Migration verification | Σ alloc = line qty; per-stock bucket reconciliation query returns 0 rows on the seeded dev database |
| IT-LOT-13 | Reports unchanged | Memo Outstanding › Vendor, Purchase Outstanding, Customer outstanding values identical before/after a lot pick equivalent to per-ID picks |
| IT-LOT-14 | `latestStockUser` | finds the document through the alloc tables |

## Integration (inventory and cross-service)

| ID | Scenario | Expected |
|---|---|---|
| IT-LOT-I01 | `stock/lots/available` and `stock/lots` | grouping and FIFO order; no cost fields; > 500 → 422; ≤ 4 in flight → 503 BUSY beyond |
| IT-LOT-I02 | Reserve with an own-stock lot (master + inventory) | holds per stock equal to the FIFO allocation; `reserve_line_alloc` own rows |
| IT-LOT-I03 | Pre-read race | another Reserve takes a stock between the pre-read and the PUT → refusal mapped to the lot line, nothing held, op IDLE |
| IT-LOT-I04 | Sale v2: lot line + reserve line | master allocates/settles, result.allocations stored; inventory `sale_line_alloc` equals it; replay of the same revision returns the same allocation; kill between master apply and tx1 recovers |
| IT-LOT-I05 | Sale legacy line | v1 shape still accepted for lines already on a stored sale |
| IT-LOT-I06 | Load edit changes a stock's lot | `lot_key` recomputes; lot pickers move it to the new group |

## Frontend (FE-LOT-008)

- Unit tests for the lot cell (lot badge, stone code, details, note; no Stock ID anywhere in the DOM).
- Integration tests for each changed picker: MemoStockModal in Memo Return and From Stock modes, Purchase MemoStockPicker with lot Sold/In stock and the Merge question, Sale ReserveLinePicker and MemoOutstandingModal with Lot first. Rows are keyed by `lotKey`; already-picked lots are hidden; payloads send `lotKey`; short errors map to the row.
- Item tables, row panels and previews show Lot and details only; legacy lines show their Lot (or "—"); a DOM assertion checks no Stock ID is rendered.

## Capacity checks (BE-LOT-011)

- Picker p95 with 20,000 open rows / 5,000 lots: DB time < 150 ms.
- Apply of 200 lot lines × 10 candidates: < 1 s, within `WRITE_TX` 4 s.
- Inventory RSS during a 200-key `stock/lots` call: < 200 MiB.
- Statement counts are asserted in tests (no N+1).

## Security

Before frontend and backend handoff, the final code goes through `sec-auditor` and `security-auditor` once, on the same source revision (workflow rule). Focus areas: `lotKey` validation, internal route guards, and no cost in own-stock lot rows.

## Stock ID not exposed (owner Q-LOT-10)

| ID | Check |
|---|---|
| IT-LOT-15 | Public responses of every changed procedure / route (pickers, document get/list, Approve Center summary/pending/preview, Sale, memoOutstanding) contain no `stockId`, `stockIds` or allocation rows (schema-level assertion on the output types plus a response scan in integration tests) |
| IT-LOT-16 | Allocation rows with Stock ID snapshots are still written and readable server-side; internal routes still carry Stock IDs |

## Implementation verification (backend, 2026-11-21)

Source: working tree of branch `feat/20-11-26-change-stockId-to-lot` (uncommitted), BE-LOT-001…010 and 012. Disposable PostgreSQL `postgres:18.6-alpine` on 127.0.0.1:55439 (tmpfs), never the dev 5432 database: auth, master, role provisioning (`provision-inventory-authz-reader.sql`, `provision-inventory-roles.sql`), inventory migrations as `gms_inventory_migrator`. Env: `PARTNER_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `INVENTORY_TEST_DATABASE_URL`, `INVENTORY_APP_TEST_DATABASE_URL`, `INVENTORY_AUTHZ_TEST_DATABASE_URL`.

| Suite | Command | Result |
|---|---|---|
| master (fresh DB) | `pnpm --filter @gem-crm/backend-api-master exec vitest run` | 855 tests: 834 passed, 17 skipped, 4 failed → after two test fixes 2 failed: IT-SD-04/05 and IT-SD-09 (`soft-delete.db.integration`, Purchase Order `checkLineLocations` VALIDATION_ERROR; failed identically before any lot change on this branch, unrelated) |
| master new | `test/trade-document/lot-allocation.test.ts` (15), `lot-based-stock.db.integration.test.ts` (10) | all passed |
| inventory (fresh DB) | `pnpm --filter @gem-crm/backend-api-inventory exec vitest run` | 99 / 99 passed (incl. IT-LOT-I01, I02/I03, I04) |
| typecheck / lint | `tsc --noEmit`, `eslint src "test/**/*.ts"` (both services) | clean |
| dev migration check | dev `partner` schema copied into a second disposable DB, `prisma migrate deploy` | applied; backfill 9 reserve / 5 memo out / 2 memo return / 4 purchase / 2 memo out return alloc rows; 27 lot keys; WARNING for 1 seeded row (see below) |

Test map: UT-LOT-01 (key regex, cursor round trip, section cursor, `lot_required` rule), UT-LOT-02 (owner example + 1,000-case property test), UT-LOT-03/04, UT-LOT-05, apply planner, Sale v2 expansion → `lot-allocation.test.ts`. IT-LOT-01, 02/15, 03/14 (+06), 04, 05, 07, 08, 09, 10, I04 master side → `lot-based-stock.db.integration.test.ts`. IT-LOT-I01, I02/I03 → inventory `test/phase2/own-stock.db.integration.test.ts`; IT-LOT-I04 inventory side → `test/sale/sale.db.integration.test.ts`. IT-LOT-11 (legacy) → every existing document suite (legacy item lines, now through the allocation path) passes; IT-LOT-12 → in-migration verification on the dev copy; IT-LOT-13 → Memo Outstanding vendor / customer suites unchanged in figures. Existing tests changed only where the approved contract changed: `stockId` is null in public outputs (Q-LOT-10/17/18), Stock ID no longer searchable (Q-LOT-10a), `SALE_IN_USE` without Stock IDs, the dropped `sale_consumption_line_reserve_line_key`, the Purchase approve statement budget (1 → 3: bucket UPDATE + allocation DELETE + INSERT), and the owner's own-first From Stock order (inventory IT-LS-P2-01, owner change 2026-11-20).

N+1 / statement budgets (asserted): `memoStock.lots` = 1 statement per page for any number of lots (spy on `$queryRaw`); inventory `stock/lots/available` = 1 statement (harness query counter); `purchase.memoStockLots` ≤ 2 page statements + 1 count; `fromStock.lots` = 1 inventory call + 1 Memo Stock statement per page. Apply: 1 line read + 1 lock (≤ 2,001 rows) + 1 bucket re-check + 1 bucket UPDATE + 1 allocation DELETE + 1 INSERT, independent of the line count (IT-PU-B06 asserts the write count for 200 lines).

Capacity (BE-LOT-011, `LOT_CAPACITY=1 vitest run test/trade-document/lot-capacity.measure.test.ts`, laptop Docker, end-to-end incl. Node + Prisma): 20,000 open rows / 5,000 lots → `memoStock.lots` first page p95 25 ms, deep page 26 ms, search p95 101 ms (first version 222 ms; rewritten to one semi-join), `fromStock.lots` (Memo) 23 ms — target < 150 ms met. Memo Out of 200 lot lines × 10 candidates approved in 232 ms (400 allocation rows) — target < 1 s and WRITE_TX 4 s met. Inventory RSS during a 200-key `stock/lots` call: **not measured** (open, BE-LOT-011).

In-migration verification on dev data: allocations = line quantities for every applied line (0 mismatches); reserved / returned buckets reconcile (0); sold / purchased: 1 row (Stock ID 260005, sold 300 without any Sale or Purchase document, seeded) → reported as WARNING instead of aborting (deviation, see the TODO). Report query: the second block of step 6 in `20261120090000_lot_based_stock/migration.sql`.

Live (dev, 2026-11-21): both migrations are applied on dev (checksums equal the files; applied by the stack restart at 08:15 UTC 2026-11-20). After `docker compose … up -d backend-api-inventory-migrate backend-api-inventory`, restarts, `node docker/repair-dev-networks.cjs` and `nginx -s reload`, read-only smoke as superadmin: `fromStock.lots` 200 (15 lots, our stock first, `ownStock OK`, no `stockId`), `memoStock.lots` 200, `purchase.memoStockLots` 200, `memoOut.get` line `stockId: null, allocated: true`, Load to Stock detail rows `stockId: null`, Sale detail lines `stockId: null`.

Security: sec-auditor and security-auditor reviews of this source revision are still to be dispatched by the parent (not run by backend).

## Owner change 2026-11-21 verification

Same disposable-DB recipe (fresh `postgres:18.6-alpine`, all migrations incl. `20261121090000_lot_key_without_price` and `20261121090000_own_lot_key_per_stock`). Master full suite: 856 tests, 833 passed, 18 skipped, 5 failed: the 2 known soft-delete failures (IT-SD-04/05, IT-SD-09, Purchase Order location validation, unrelated) and 3 `auth-context.http` tests that failed with `fetch failed: bad port` (the test server drew a fetch-blocked port); that file passes 7/7 when re-run. Inventory: 99/99. Typecheck and lint clean.

Changed tests: IT-LOT-01 (same lot at another price → one key; weighted average row: 2 pcs at 100, 2 at 100, 2 at 101 → unitPrice 100.33, amount 602.00), IT-LOT-I01 (own stock: one `OS<id>` row per stock, `merged: false`), IT-LOT-I02/I03 (own-stock lot line = one stock). Stock ID restored (tests reverted to the pre-lot expectations): Memo Receive, Load to Stock, Memo Outstanding Vendor / Customer, Memo Out Return picker + lines + search, Sale detail and `SALE_IN_USE {stockIds}`, Approve Center search (Stock ID on `memo-receive` and `memo-out-return`, lot on the other five).

Dev (2026-11-21): both new migrations applied by `up -d backend-api-inventory-migrate` and api-master restart (inventory and partner `_prisma_migrations` list them last). Smoke as superadmin: `fromStock.lots` 15 rows, our stock first, own rows `OS…`, `merged: false`; `memoOut.get` line `stockId: null`; Load to Stock rows `["260035","260036"]`; Sale line `["260014"]`.

## Round 2 verification (FE-LOT-008, INV-20261121-002 F1 / H1–H5, 2026-11-21 to 23)

Fresh disposable `postgres:18.6-alpine` (127.0.0.1:55439), all migrations. Master full suite: 845 tests, 827 passed, 18 skipped, 0 failed (the earlier flaky `auth-context.http` "bad port" and the 2 soft-delete failures did not occur in this run). Inventory: 100/100. Typecheck and lint clean in both services.

New / changed tests: IT-LOT-H2 (a new item reference → `400 lot_required` on Memo Out, Quotation and Memo Return; the legacy item already on the document stays editable; a lot line is accepted), IT-LOT-F1 (two drafts of one own lot: second approve refused `PENDING_SHORT`), cursor calendar-date tests (master and inventory), router / HTTP grant tests moved from the removed `memoStock.list` / `fromStock.list` / `purchase.memoStock` to `memoStock.lots` / `fromStock.lots` / `purchase.memoStockLots` (the lot service is injectable in `createMasterRouter` for those unit tests), IT-MR-06 and IT-PU-B05 rewritten as lot-picker tests. Test seam: `LOT_TEST_ACCEPT_ITEM_REFS=1` under Vitest only (master `test/setup.ts`, inventory harness) keeps the pre-lot item suites running; the lot_required test switches it off.

Dev (2026-11-23): api-master and inventory restarted; `fromStock.lots` 200; `fromStock.list`, `memoStock.list`, `purchase.memoStock` → 404; Load to Stock rows still return the Stock IDs.
