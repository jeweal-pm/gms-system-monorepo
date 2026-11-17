# Backend verification plan: inventory / load-to-stock (SA revision 1, pending-review)

Follows [automated testing](../../../../workflow/automated-testing.md). Integration tests use a disposable PostgreSQL (tmpfs, no project volume) with both schemas migrated (`partner` by master's migrations, `inventory` by inventory's) and a real master HTTP process or its Nest testing module bound to a port; no mocked master for IT-*. Backend fills Result and commands.

## Unit

| ID | Target | Path (backend-api-inventory/test/ unless noted) |
|---|---|---|
| UT-LS-B01 | Zod schemas: strict, 1–200 rows, ≤ 200 sources, decimals as strings with scale limits, mode shape (NONE 1:1, SPLIT 1 source/row, MERGE ≥ 2 sources, 1 row), photoIds ≤ 5 unique, required location/stock/sale price, parcel ≤ 50 | `load-to-stock/schemas.test.ts` |
| UT-LS-B02 | Cost: net × rate (rate 1 when the PU is in the company currency), PER_CT by weight, PER_PCS by pcs, 4 dp / 2 dp half-up; Merge totals and row unit price (design numbers 1,387,835.60 ÷ 29.30 = 47,366.40); highest company-currency/pc source with tie rule; merged unit PER_CT unless all PER_PCS | `load-to-stock/cost.test.ts` |
| UT-LS-B03 | Remaining validation incl. owner Q-LS-26 (pcs-0 lines never offered, row pcs ≥ 1, row weight 0 only when the source weight is 0), write-off on close, Split Σ ≤ remaining, edit with own allocation excluded | `load-to-stock/validate.test.ts` |
| UT-LS-B04 | Saga state machine: PREPARED→CONFIRMED→DONE, REFUSED path, timeout keeps PREPARED, backoff, STUCK after 10, stale→reconcile via GET | `platform/sync/sync.test.ts` |
| UT-LS-B05 | Master client: timeouts, retry only on reads, error mapping table | `platform/master-client.test.ts` |
| UT-LS-B06 | Ported auth: JWKS cache limits, CSRF origin rules, grant helper, canApprove, Super Admin | `platform/auth/*.test.ts` |
| UT-LS-B07 | (master) internal guard: inventory token accepted only on `/internal/v1/inventory/*`; partner token refused there; constant-time path | `backend-api-master/test/inventory-internal/guard.test.ts` |
| UT-LS-B08 | (master) allocation delta calculation and request hash replay/stale rules | `backend-api-master/test/inventory-internal/allocation.test.ts` |

## Integration

| ID | Behaviour | Notes |
|---|---|---|
| IT-LS-B01 | Migrations: inventory fresh; master additive migration on a DB with existing purchases (loaded_* = 0, CHECK `purchase_line_loaded_check` 23514 on overload and on STOCK lines, loadable partial index used by EXPLAIN); approval rows removed/CHECK narrowed; down script when no allocation exists | both schemas |
| IT-LS-B02 | Picker: approved + not deleted + MANUAL/PO only, remaining > 0, vendor filter, date range, q escaping `% _ \`, exclusion list, keyset across pages, a closed line disappears | — |
| IT-LS-B03 | **Partial load (owner example):** PU line 10 pcs → OFF Save loads 7 → master loaded 7, picker shows 3, stock created with a `YY####` id; second load of 3 → line closed, weight remainder written off, line gone from picker | approval OFF |
| IT-LS-B04 | ON lifecycle: Save DRAFT (no master write, no IDs), Submit → PENDING (update/delete refused), Revise once → edit → Submit → second Revise refused, Approve → APPROVED + stocks + PU deducted; Reject path changes nothing; notifications + recipients rows | approval ON |
| IT-LS-B05 | Modes: NONE, SPLIT (one line → 3 rows, 3 Stock IDs, own locations), MERGE (2 lines mixed units → 1 row, 1 Stock ID, both lines closed, row_sources 2) | — |
| IT-LS-B06 | **Concurrent approve race:** two pending loads of 7 pcs on a 10-pc line approved in parallel → exactly one APPROVED, the other PENDING with `LOAD_TO_STOCK_EXCEEDS_REMAINING`; same load approved twice in parallel → one success, one CHANGED/BUSY; no deadlock across 20 parallel approvals on overlapping lines | — |
| IT-LS-B07 | **Crash/timeout recovery:** inject failure (a) after tx0, (b) after master commit before tx1, (c) master timeout → re-drive (access / start-up / sweep) converges to one state; master replay returns the same Stock IDs; no duplicate stock; refused path deletes the provisional document | fault hooks in tests only |
| IT-LS-B08 | **Stock ID uniqueness across services:** two sessions, Memo Receive and Load to Stock, with a stale-year clock around Bangkok midnight → no duplicate between `partner.memo_stock`, `partner.load_stock_id` and `inventory.stock` (INV-20261113-001 Part B acceptance) | master |
| IT-LS-B09 | Edit/delete until used (OFF): edit pcs up/down (delta to master), remove row (stock REVERSED, ID retired), add row (new ID), delete (PU remaining restored; no restore endpoint, 404/405); with any stock bucket other than on-hand above 0 (test fixture) → `LOAD_TO_STOCK_IN_USE`, and editable again after the bucket returns to 0 | — |
| IT-LS-B18 | Stock bucket CHECK (`pcs = on_hand + reserved + memo_out + sold + consumed`, weight too) refuses an inconsistent update (23514); `stock_hold` unique per document line | phase 1 schema |
| IT-LS-B19 | Locations from master: options include only active Location Master rows; Save with an inactive/unknown location → `LOCATION_INACTIVE`; code/name snapshot stored; one `master-data/resolve` call for 200 rows (NP-LS-04) | after the Location Master branch merges |
| IT-LS-B20 | Header currency = Company Profile currency (non-THB company profile in the fixture), cost conversion at each PU rate | Q-LS-23 |
| IT-LS-B10 | Master guard: Purchase update/delete after a load → `PURCHASE_IN_USE`; before any applied load (draft only) → allowed, and the draft's Approve then fails `LINE_UNAVAILABLE`/`EXCEEDS` | master |
| IT-LS-B11 | Numbering: first Save marks `external_used_at`; Document Setup refuses editing that row; running numbers gap-free per numbering row under 10 parallel creates; preview does not mark | master + inventory |
| IT-LS-B12 | Measure: OFF Save with 200 rows (end-to-end latency, master tx time, inventory RSS delta) — target p95 < 800 ms on dev; record numbers | measurement |
| IT-LS-B13 | Photos: upload JPEG/PNG ≤ 5 MiB, signature refusal, copy from PU line (≤ 5, order), second copy of the same PU photo reuses the file (no new bytes), stored under `files/load-to-stock/` only, no delete API, unlink on edit keeps bytes + metadata | storage tmp dir |
| IT-LS-B14 | Approval settings: list/put, turn-OFF guard with waiting counts, Save follows the committed setting (FOR SHARE), counts only with approval-setup:VIEW | — |
| IT-LS-B15 | HTTP auth chain: no cookie 401, bad origin 403 on mutation, missing grant 403 before input use, license denied 403, auth view down 503; 403 before 404 | real JWT signer from test keys |
| IT-LS-B16 | SSE: connect/ready/ping/reauth, ≤ 3 per user, ≤ 200 per process 503, event ids only, no DB connection held | — |
| IT-LS-B17 | Approve Center endpoints: summary counts capped 100, pending sort/search/keyset, canApprove filtering | — |

## N+1 review (required, senior-nestjs-developer rule of 2026-11-16)

Use Prisma query events (`$on('query')`, counts only, no bind values) for inventory and a request-scoped counter on master's internal controller. Each test runs with **1** and with **many** parents and asserts the same budget.

| Endpoint | Inventory DB queries | Master internal calls | Master DB queries | Test |
|---|---|---|---|---|
| purchase-lines/search (1 vs 50 rows) | 0 | 1 | 2 (page + count) | NP-LS-01 |
| GET /load-to-stock/:id (1 vs 200 rows, 200 sources, 1000 photos) | ≤ 4 (header, sources+rows, row_sources, photos) | 1 (`batch`) | 1 | NP-LS-02 |
| list / Daybook / approval pending (1 vs 50) | 2 (page + count where shown) | 0 | 0 | NP-LS-03 |
| create ON (1 vs 200 rows) | ≤ 8, set-based `createMany` per table | 3 (batch, master-data/resolve, numbering) | 1 each | NP-LS-04 |
| apply (OFF create / approve / edit) (1 vs 200 rows) | tx0 ≤ 6, tx1 ≤ 8 (createMany stock, stock_photo, movement; one `UPDATE … FROM (VALUES …)` for rows) | 1 PUT | ≤ 9 (alloc lock, header locks, line locks, one bulk update, delete+insert lines, lock, counter upsert, insert ids, result) | NP-LS-05 |
| photos/from-purchase-line (1 vs 5 photos) | ≤ 3 + 1 insert per **new** file (bounded ≤ 5) | 1 + ≤ 5 streams (bounded, documented exception) | 1 + 1 per stream | NP-LS-06 |
| notifications list (1 vs 20) | 1 | 0 | 0 | NP-LS-07 |

Any growth per row fails the test. Exceptions are only the bounded ≤ 5 photo streams above.

## Regression and reviews

Run the full `backend-api-master` suite (Purchase, Memo Receive counter, Document Setup, Approval Setting, Approve Center) after the master changes; `tsc --noEmit` and ESLint for both workspaces. Then both security reviews (`sec-auditor`, `security-auditor`) once on the same final source revision (BE-LS-012).
