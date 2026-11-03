# INV-20261029-004 — Memo Outstanding report aggregates all approved history, twice per list call, with no statement timeout

## Tracking

- Ticket revision: 2 (2026-11-03: same root cause extended to memo-outstanding-customer; see addendum)
- Status: pending-review
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

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:

## Addendum, revision 2: same root cause in From Customer (2026-11-03)

- Source: sec-auditor focused pre-handoff review of memo-outstanding-customer rev 1, uncommitted tree on `feat/03-11-26-memo-outstanding-quotation-from-stock` (HEAD 77be6bc).
- `backend-api-master/src/trade-document/memo-outstanding.service.ts:336-356` (`customerSummary`) and `:369-391` (`customerList` docs CTE, run twice: page rows plus `count(*)`) join every From Stock `memo_out_line` of every APPROVED `memo_out` matching the filters and drop settled documents only in `HAVING ${HAS_OUT_LINE}` (`:347`, `:383`). `memo_out_line_open_idx` therefore cannot prune before the aggregate, and the From Vendor paths (`:213`, `:248`) are still unchanged.
- `customerItems` (`:421-460`) already prunes with `EXISTS` and is bounded by 25 ids; `customerOptions` is bounded to 1,000 rows. Neither is affected.
- Same category/verdict (hardening, not-applicable), same owner (backend), same proposed remediation: apply the `EXISTS` open-line predicate before grouping in both customer CTEs, and use `count(*) OVER ()` or a pruned count. Acceptance adds: the IT-MOC integration suite passes unchanged.
- No new ticket was created for this; this record remains the single canonical item for both reports.
