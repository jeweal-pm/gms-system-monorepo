# INV-20261029-004 — Memo Outstanding report aggregates all approved history, twice per list call, with no statement timeout

## Tracking

- Ticket revision: 3 (2026-11-20: reopened after current local dataset exceeded the original 50k benchmark; see Resolution, pass 2)
- Status: needs-validation (pass 2 implemented and running locally; disposable database integration verification unavailable)
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor, focused pre-handoff review of memo-outstanding-vendor, 2026-10-29 (sec-auditor on the same revision: clear, with advisory A1 on the same point)
- Date and audit scope: 2026-10-29; uncommitted working tree on `feat/29-10-26-integrate-memo-receive` (HEAD 8e30891)
- Source commit, dirty paths: `backend-api-master/src/trade-document/memo-outstanding.service.ts`
- Related ticket / root-cause fingerprint: the open-item predicate is applied only in HAVING, after grouping
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- `memo-outstanding.service.ts:121-128` (summary CTE) and `:155-162` (list CTE) join every `memo_stock` row of every APPROVED `memo_receive` that matches the filters. Settled documents are dropped only afterwards, by `HAVING bool_or(open)` (`:42`), so the partial index `memo_stock_open_idx` cannot prune the work. `:164-174` repeats the aggregation for `count(*)`.
- One page load therefore runs 3 full aggregations on 3 of the 5 pool connections (`src/database/prisma-client.ts:6`: max 5, acquire timeout 2 s, no `statement_timeout`). The cost grows with settled history, not with open documents.
- Impact today: none, because the dataset is tiny. As history grows, a few viewers or refreshes could cause 2 s acquire failures on other master endpoints. Every caller is an authenticated VIEW holder, and no data is exposed.

## Proposed work

- Allowed scope: backend, `src/trade-document/memo-outstanding.service.ts` and its tests. The contract does not change.
- Suggested remediation:
  - Add the open predicate as `EXISTS (… memo_stock o WHERE o.memo_receive_id = r.id AND (pending or reserved > 0))` before grouping, in both CTEs.
  - Return the total with `count(*) OVER ()` (or keep the count once it is pruned).
  - Optionally add a `SET LOCAL statement_timeout` for the report queries.
- Acceptance:
  - EXPLAIN on a seed with many settled documents shows pruning before the aggregate.
  - A list call holds at most 1–2 connections.
  - IT-MOV-01…05 pass unchanged.
  - The SA-MOV-05 "measure at 50k" timing is recorded.

## User selection and approval

- Approved ticket revision: current
- Actual user instruction / approval evidence: owner 2026-11-13: "แก้ไข INV-20261029-004" — fix now
- Approval date: 2026-11-13

## Addendum, revision 2: same root cause in From Customer (2026-11-03)

- Source: sec-auditor focused pre-handoff review of memo-outstanding-customer rev 1, uncommitted tree on `feat/03-11-26-memo-outstanding-quotation-from-stock` (HEAD 77be6bc).
- `backend-api-master/src/trade-document/memo-outstanding.service.ts:336-356` (`customerSummary`) and `:369-391` (`customerList` docs CTE, run twice: page rows plus `count(*)`) join every From Stock `memo_out_line` of every APPROVED `memo_out` matching the filters and drop settled documents only in `HAVING ${HAS_OUT_LINE}` (`:347`, `:383`). `memo_out_line_open_idx` therefore cannot prune before the aggregate, and the From Vendor paths (`:213`, `:248`) are still unchanged.
- `customerItems` (`:421-460`) already prunes with `EXISTS` and is bounded by 25 ids; `customerOptions` is bounded to 1,000 rows. Neither is affected.
- Same category/verdict (hardening, not-applicable), same owner (backend), same proposed remediation: apply the `EXISTS` open-line predicate before grouping in both customer CTEs, and use `count(*) OVER ()` or a pruned count. Acceptance adds: the IT-MOC integration suite passes unchanged.
- No new ticket was created for this; this record remains the single canonical item for both reports.

## Scope note 2026-11-06 (purchase-outstanding rev 1, ADR-0044)

`purchaseOutstanding.summary` / `list` use the same `receiveFilters` + GROUP BY over all approved Memo Receives, so they share this root cause (sec-auditor, 2026-11-06). Any fix for this ticket should cover them too; no separate ticket.

## Resolution (pass 1)

- Owner / date: backend, 2026-11-13. Corrective pass 1 of 3 (initial fix); result: resolved. Branch `fix/12-11-26-inv`, base `2126ec01` + uncommitted working tree.
- Scope: all three reports that shared the root cause — Memo Outstanding From Vendor (`vendorSummary` / `vendorList`), From Customer (`customerSummary` / `customerList`, addendum rev 2) and Purchase Outstanding (`purchaseSummary` / `purchaseList`, scope note 2026-11-06). Contracts unchanged (same fields, totals, sort, paging, errors).
- Change (`backend-api-master/src/trade-document/memo-outstanding.service.ts`):
  - The open predicate is an `EXISTS` in `WHERE`, before `GROUP BY`, instead of `HAVING bool_or(…)` after it: `memo_stock` pending/reserved > 0 (vendor; partial index `memo_stock_open_idx`), `memo_out_line` From Stock with something still out (customer; `memo_out_line_open_idx`), `memo_stock` received − returned − purchased > 0 (purchase; new `memo_stock_balance_open_idx`). Same meaning: a document is kept iff any of its items/lines is open. The item queries reuse the same predicates (SQL unchanged in meaning).
  - The list total comes from `count(*) OVER ()` in the page statement, so a list call is **one statement on one connection** (was two parallel aggregations on two connections). Only a page past the end (no row to carry the total) runs the pruned count once, in the same transaction.
  - Every summary / list statement runs in one `READ_TX` (2.5 s) with `SET LOCAL statement_timeout = 2000`, so a slow report fails fast as `DEPENDENCY_UNAVAILABLE` instead of holding a pool connection. A page load (summary + list) therefore holds at most 2 connections, one each, briefly.
  - Migration `backend-api-master/prisma/migrations/20261113100000_purchase_outstanding_open_idx/migration.sql` (expand only): partial index `memo_stock_balance_open_idx` and expression statistics `memo_stock_balance_stats` (without them the planner assumes 1/3 of items have a balance and hash-joins every memo_stock row).
- Tests: new `test/trade-document/memo-outstanding.service.test.ts` UT-MOS-01…04 (EXISTS before GROUP BY, no HAVING / bool_or, `count(*) OVER ()`, the past-the-end count, `SET LOCAL statement_timeout`, one READ_TX per call, all three reports). Unchanged and passing: IT-MOV-01…05 (`memo-outstanding.db.integration.test.ts`), IT-MOC (`memo-outstanding-customer.db.integration.test.ts`), IT-POS-01 (`purchase.db.integration.test.ts`), router tests.
- Measurement (SA-MOV-05 "measure at 50k"): disposable PostgreSQL 18.6 container (`--memory 512m --cpus 1`, inside the 4 GB / 2 vCPU budget), seeded with **10,000 approved Memo Receives / 50,000 memo_stock rows** (99 % settled, 100 documents / 500 items open) and **10,000 approved Memo Outs / 50,000 From Stock memo_out_line rows** (same 1 % open), `ANALYZE`d, all migrations applied. `EXPLAIN (ANALYZE)` of the list SQL (page 1 of 10, default sort):

  | Report | Before: page + count (2 statements, 2 connections) | After: one statement with `count(*) OVER ()` | Plan after |
  |---|---|---|---|
  | From Vendor | 278 ms + 53 ms; GroupAggregate over all 10,000 docs, "Rows Removed by Filter: 9900" | **8.7 ms** | Bitmap Index Scan `memo_stock_open_idx` (500 rows) → semi join → index scan of the 100 open docs' items → HashAggregate 100 rows |
  | Purchase Outstanding | count 60 ms (same full aggregation) | **7.1 ms** | Bitmap Index Scan `memo_stock_balance_open_idx` (500 rows), aggregate over 100 docs |
  | From Customer | 140 ms + 49 ms; "Rows Removed by Filter: 9900" | **30 ms** | Bitmap Index Scan `memo_out_line_open_idx` prunes to 100 docs before the HashAggregate; the planner still hash-joins `memo_out_line` (sequential scan, 50,000 rows) because it cannot estimate the column-vs-column open predicate; expression statistics did not change that (tried, not added) |

- Remaining risk: the From Customer list still reads every `memo_out_line` row once per call (≈30 ms at 50,000 lines, linear in history) although only open documents are aggregated; the 2 s statement timeout bounds it. If it grows, a follow-up can rewrite the open predicate into an estimable form with its own partial index. Offset paging remains as approved (SA-MOV-05).
- Completion report: [2026-11-13 INV fixes](../done/2026-11-13-inv-fixes.md).
- Final status / date: resolved, 2026-11-13.

## Reopened evidence and approval (revision 3)

- Reopen evidence: on the current local database, PostgreSQL logs from 2026-11-19 16:56–17:08 UTC repeatedly show `canceling statement due to statement timeout` for paired Memo Outstanding report requests. The user reported `memoOutstanding.vendorSummary` and `vendorList` returning HTTP 503 `DEPENDENCY_UNAVAILABLE` at `/memo/memo-outstanding/vendor` and directly instructed “งั้นคุณแก้ที” on 2026-11-20.
- Current data: approximately 100,000 `memo_receive`, 123,970 `memo_stock`; no dead tuples and table statistics were current. PostgreSQL `work_mem` is 4 MB. A read-only `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY)` of the same unfiltered approved/open vendor-summary aggregation took 1,440 ms, read 17,816 shared buffers, and spilled 1,234 temp blocks (1,236 written); its per-worker sorts used external merge. With session-local `work_mem = 16MB`, the same query took 817 ms, used a single in-memory `HashAggregate` (about 25.6 MB), and produced no temp reads/writes. Both plans used the existing `memo_stock_open_idx` and preserved the approved/open filtering. The database container has a 1 GB limit; report transactions use the shared 5-connection Prisma pool.
- Root-cause fingerprint: report aggregation remains memory-bound at current local history size; 4 MB `work_mem` causes sort spill and the 2-second statement timeout is too close to the measured execution time. This is a recurrence of the same report-query resource boundary, not the separately tracked P2010 error-mapping gap in INV-20261113-001 Part A.
- Approved ticket revision: 3.
- Actual user instruction / approval evidence: user 2026-11-20: “งั้นคุณแก้ที” (fix the reported vendor outstanding report failure).
- Approval date: 2026-11-20.
- Allowed paths: `backend-api-master/src/trade-document/memo-outstanding.service.ts`, its focused tests, this investigation record, and a completion report under `document/task/done/`.
- Acceptance: set a bounded, transaction-local memory setting for report reads only; keep existing API contract, READ_TX limits, pooling, and shared PostgreSQL defaults unchanged; cover the setting in unit tests and run the applicable backend checks; both focused security reviews complete on the same final code revision.
- Verification: bounded, read-only EXPLAINs were executed on the local project database with `statement_timeout = 5s`; no data was changed. Relevant unit/integration tests and project checks remain to run.

## Resolution (pass 2 — active)

- Owner / date: backend, 2026-11-20. Corrective pass 2 of 3; pass 1 remains the 2026-11-13 fix above.
- Hypothesis: report-local `work_mem = 16MB` will avoid the measured temp sort spill and reduce runtime enough to keep the existing 2-second statement and 2.5-second transaction limits effective without increasing the database-wide memory budget.
- Planned change: set `work_mem` locally inside the existing `reportRead` transaction and assert it alongside the statement timeout in `memo-outstanding.service.test.ts`. This affects only report transactions and is bounded by the existing 5-connection API pool.
- Changed: `backend-api-master/src/trade-document/memo-outstanding.service.ts` sets `work_mem` to 16MB using `SET LOCAL` inside the existing `reportRead` transaction, after the existing 2s statement timeout. The PostgreSQL default, READ_TX limits, pool size, schema, and API contract remain unchanged. `memo-outstanding.service.test.ts` asserts the local setting for reports.
- Measurement: the current local dataset's vendor summary completed in 1,440 ms with 4MB work_mem and spilled 1,234 temp blocks; with 16MB it completed in 817 ms without temp I/O. The latter plan used about 25.6MB for its single HashAggregate. The report setting is transaction-scoped; all six summary/list methods for vendor, customer, and purchase outstanding share this helper, with existing API pool max 5.
- Verification: focused unit suite passed (4/4); scoped ESLint passed; after restarting `api-master`, Nest watch compilation reported `Found 0 errors`, and `/health/ready` returned HTTP 200 (`{"status":"ok"}`). Startup ran Prisma generate and `migrate deploy`; there were no pending migrations. Full package suite: 60 test files passed, 639 tests passed, 16 test files / 106 tests skipped, and one unrelated `IT-MAUTH-DB-U1` failed because the container supplies `MASTER_AUTHZ_DATABASE_URL` while that test expects the variable to be unset. Memo Outstanding database integration cases were skipped because no disposable `PARTNER_TEST_DATABASE_URL` is configured. A separate `tsc --noEmit` attempt was interrupted when it approached the container's 1GB memory limit; Nest watch compilation subsequently completed with zero errors.
- Focused security review of the same changed source (SHA-256 `ede0fdbd3a3b6626b364468c6af343d8bfba95dda6fb74f6ded8815c01e392fe`): custom auditor roles were unavailable, so the parent applied `sec-auditor` and `security-auditor` instructions sequentially. Both scoped reviews were clear: the added SQL is a fixed numeric setting, executes only inside the existing transaction, receives no request input, and does not change auth, data access, or error handling. Each report remains set-based (no N+1 path introduced). No finding or extra ticket.
- Runtime: restarted only local `api-master`; it is healthy and ready. Completion record: [2026-11-20 Memo Outstanding report work_mem](../done/2026-11-20-memo-outstanding-report-work-mem.md).
- Remaining verification gap: the existing `IT-MOV`, `IT-MOC`, and `IT-POS` tests need a disposable `PARTNER_TEST_DATABASE_URL` to run; they were not run against the application's data database. Keep this ticket `needs-validation` until those integration cases pass. Pass 2's code change is complete; do not consume another pass without new failure evidence.
