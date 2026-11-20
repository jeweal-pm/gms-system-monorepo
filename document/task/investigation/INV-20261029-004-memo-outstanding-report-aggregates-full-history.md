# INV-20261029-004 — Memo Outstanding report aggregates all approved history, twice per list call, with no statement timeout

## Tracking

- Ticket revision: 5 (2026-11-20: owner authorized one additional corrective pass after pass 3 still timed out; see Resolution, pass 4)
- Status: needs-validation (pass 4 query-only change is running locally; authenticated page-level confirmation is pending)
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

## Reopened evidence and approval (revision 4)

- New evidence, 2026-11-20: after pass 2 was deployed locally, PostgreSQL logged repeated statement-timeout cancellations for both vendor and customer report statements. Current live counts are 100,000 `memo_receive`, 2,170,527 `memo_stock`, 62,030 open vendor documents, 3,501,138 `memo_out_line`, and 39,959 From Stock lines. Relation sizes are 1.5 GB for `memo_stock` and 1.1 GB for `memo_out_line` (table only; indexes excluded).
- Read-only plan evidence, using the same approved/open-document predicates and grouping as the service, but only the inexpensive quantity sums (therefore a lower bound on full statement work): vendor report aggregation took 6,897 ms with 16 MB `work_mem`; PostgreSQL used 62,030 per-document index scans into `memo_stock` and read 115,743 shared blocks. The corresponding customer aggregation took 2,545 ms; 19,084 per-document index scans visited the existing all-lines index and removed an average of 34 non-stock lines per document. Both exceed the fixed 2 s statement budget even before the full value calculations. No data was changed.
- Updated root-cause fingerprint: source-level pruning is correct, but the 2 s report timeout and 2.5 s generic read-transaction limit no longer fit the measured workload. The approved dataset now makes each endpoint scan substantial item history; pass 2's 16 MB transaction-local memory avoids the old sort spill but cannot remove the remaining row/index I/O.
- User authorization: the owner reports both pages still return 503 after deployment, continuing the existing direct fix instruction (“งั้นคุณแก้ที”). Revision 4 keeps the existing API, schema, queries, global PostgreSQL settings, and ordinary `READ_TX` behavior unchanged.
- Corrective pass allocation: pass 3 of 3, allocated before editing on 2026-11-20. This final pass raises only the report-specific transaction budget to 16 s and statement budget to 15 s, preserving the 2 s pool-acquisition limit and the 16 MB local work memory. This is a bounded runtime mitigation for the measured 2.5–6.9 s lower-bound query timings; it does not claim to reduce the underlying full-history read cost.
- Allowed paths for this pass: `backend-api-master/src/trade-document/memo-outstanding.service.ts`, this investigation record, and a completion report under `document/task/done/`. No schema/index migration or API contract change is included.
- Acceptance: focused runtime calls for both pages complete below the report budget and readiness stays healthy. If either report remains slow or times out, stop at the attempt limit and record the remaining performance work; do not increase limits again.

## Resolution (pass 3 — active)

- Owner / date: backend, 2026-11-20. Corrective pass 3 of 3; prior passes and their evidence remain above.
- Changed locally: `REPORT_STATEMENT_TIMEOUT_MS` is now 15,000 ms, and `reportRead` uses a report-only 16,000 ms repeatable-read transaction with the existing 2,000 ms acquisition limit. Other master reads still use the existing `READ_TX`; PostgreSQL-wide defaults, schema, endpoint contract, and report SQL are unchanged.
- Verification: restarted local `api-master`; Prisma generation succeeded, `migrate deploy` found no pending migrations, Nest watch reported `Found 0 errors`, container health is `healthy`, and `/health/ready` returned HTTP 200. Authenticated vendor/customer report procedures were not exercised; automated tests were not run in this pass. See the updated [completion record](../done/2026-11-20-memo-outstanding-report-work-mem.md).
- Focused reviews on changed source SHA-256 `21def82845e3345884f4c226065fb9f40cf6560a507ff270f52327bd57036580`: custom reviewer roles were unavailable; the parent applied `sec-auditor` and `security-auditor` instructions sequentially. Both found no new input/auth/data-isolation issue. Availability advisory: one report can hold a shared pool connection up to 16 s; concurrent requests can contend for the five-connection pool. This is the bounded availability tradeoff for the runtime mitigation, not a confirmed vulnerability.
- New failure evidence, 2026-11-20: after the restarted, healthy API compiled the 15 s report setting, PostgreSQL again canceled vendor summary/list statements at 05:13:59–05:15:29 UTC due to `statement_timeout`. Cancellations recurred about every 16–17 seconds, confirming the reports exceed the new 15 s setting under current load. No connection exhaustion, OOM, or other PostgreSQL error appeared in the same interval. API source inside the running container confirms `REPORT_STATEMENT_TIMEOUT_MS = 15000` and report transaction timeout `16000`.
- Outcome: pass 3 failed to restore these pages. The current fix remains active locally but is insufficient. Root cause is now confirmed as report work exceeding 15 seconds against current full-history data; the local API is healthy, so this is not a container start or stale-image problem.
- Stop condition before extension: the original three-pass limit was exhausted. On 2026-11-20 the user explicitly authorized one additional pass: “อนุญาติ รอบนี้ลองแก้ดู”.

## Corrective pass 4 allocation (2026-11-20)

- Authorization: user explicitly extended the existing ledger by one corrective pass after reviewing that both reports still exceeded 15 s. Total limit is now four passes for this root cause; no further extension is implied.
- Evidence reviewed: the user's `backend-join-analysis-2026-11-19.html`, finding S4. The report recommends measuring Memo Outstanding and then considering pre-aggregation or index changes; live measurements now confirm the failure. It does not prescribe a particular index or prove a schema change is low risk.
- Additional read-only plan evidence: current `memo_out_line_open_idx` contains about 30,747 rows / 4.7 MB and matches the still-open stock-line predicate. An equivalent full customer-summary calculation over still-open stock lines took 347 ms; a default due-date customer-list plan that selects the 25 headers first and aggregates only their stock-line quantities took 275 ms (the final page adds open-value calculations for at most those 25 documents). A default due-date vendor-list plan with the same page-first shape and full report sums took 850 ms. A broad vendor-summary plan that materializes eligible headers and uses a hash join / sequential item scan took 8,994 ms with `enable_nestloop=off`, versus the existing statements repeatedly timing out. These were read-only plans on the application DB; no data or schema was changed.
- Hypothesis: default page entry can avoid aggregating every document's full item history by selecting the filtered/open document page first, then grouping lines only for those 25 rows. Customer summary can sum only lines that are still open because closed lines contribute zero to open value. Vendor summary can use a bounded report-local planner choice for the broad unfiltered request to avoid tens of thousands of random per-document scans. Together these changes preserve the existing API values, filters, default due-date ordering, pagination total, and schema while reducing duplicated full-history work on initial entry.
- Scope/allowed paths: backend-only query changes in `backend-api-master/src/trade-document/memo-outstanding.service.ts` and its focused test `backend-api-master/test/trade-document/memo-outstanding.service.test.ts`, this investigation record, and the existing completion record under `document/task/done/`. No Prisma migration, schema, contract, frontend, container, or dependency change. Since no schema/contract/flow change is proposed, no SA design review is needed for this pass.
- Acceptance: compile and restart local `api-master`; readiness is healthy; measured default page/list summary query shapes remain under the 15 s report budget. Unit tests cover emitted SQL shape; untested database equivalence remains explicitly `needs-validation`. Do not raise timeouts again.
- Pass allocation: corrective pass 4 of 4, allocated before the next code edit.

## Resolution (pass 4 — query-only optimization)

- Changed `backend-api-master/src/trade-document/memo-outstanding.service.ts` without changing the API, schema, or dependencies:
  - For the default due-date list sort on both pages, materialize filtered open document headers, select the requested page and total first, then aggregate stock lines only for those page documents. Other aggregate-based sorts retain the existing full-dataset query because they must compare aggregate values across documents.
  - Customer summary now aggregates only still-open From Stock lines and counts distinct eligible Memo Outs. Closed lines have zero open value; PostgreSQL can use the existing `memo_out_line_open_idx` instead of probing the large history index.
  - For the broad unfiltered vendor summary only, run a transaction-local `enable_nestloop = off` and materialize eligible headers so PostgreSQL chooses a hash join/sequential item scan. Filtered summaries retain the original plan.
- Database plan measurements on current local data: customer summary 347 ms; customer default list 275 ms; vendor default list 850 ms; broad vendor summary 8,994 ms. Each is below the existing 15 s report timeout. Compared with the previously canceled broad reports, this removes full-history aggregation from default list requests; the vendor KPI still scans the large item table once.
- Verification: focused service unit suite passed (4/4); ESLint passed for the changed service and test. `api-master` restarted, Nest watch reported `Found 0 errors`, container is healthy, and `/health/ready` returned 200. The source remains bind-mounted locally; no migration ran or was pending. Authenticated page procedures and DB integration suites were not run, so exact page-level behavior still needs owner confirmation.
- N+1/query count review: each summary/list endpoint still executes one set-based report SQL statement (plus fixed transaction-local settings); the default list groups one batch of lines for at most the requested page, not one query per document. No new N+1 path is introduced.
- Focused security reviews for final source SHA-256 `8fb4817df582a8748608b912d821ebe16d18c8159a8e539cb89500ebc16b8846`: no new input, authorization, or data-isolation issue. The broad vendor summary still has a bounded availability advisory because one request scans the 1.5 GB item relation and can hold a report-pool connection for several seconds; the page-first list path removes the second concurrent full scan on default entry. No schema/index was added, so the HTML report's higher-risk storage and write-amplification concerns were avoided.
- Limits: lists sorted by aggregate columns and filtered vendor summaries still use their original aggregation path and may be slower on broad filters. If those modes are also used at scale, treat them as separate evidence within this same ticket; no fifth correction is authorized by the pass 4 extension.
- Final outcome for pass 4: implementation and measured query-plan acceptance pass; ticket remains `needs-validation` only for authenticated owner page confirmation and DB-backed report equivalence/integration verification. See [completion record](../done/2026-11-20-memo-outstanding-report-work-mem.md).
