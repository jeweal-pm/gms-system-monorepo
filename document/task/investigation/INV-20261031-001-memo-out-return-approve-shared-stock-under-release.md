# INV-20261031-001 — Memo Out Return approval releases only one line per shared Memo Stock item

## Tracking

- Ticket revision: 1
- Status: resolved (2026-10-31)
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor, focused pre-handoff review, 2026-10-31
- Date and audit scope: 2026-10-31; memo-out-return rev 4 / memo-out rev 3 working tree (backend `memo-out-return.service.ts`, `memo-stock.service.ts`, `memo-schemas.ts`, migration `20261101090000_memo_out_return_customer`)
- Source commit, dirty paths, and relevant content hashes: HEAD `4ded0ae` plus uncommitted changes; blob hashes `memo-stock.service.ts` 645b55b2, `memo-out-return.service.ts` baf283ba, `memo-schemas.ts` 12aca9da
- Related ticket / root-cause fingerprint: `releaseToMemoStock` UPDATE ... FROM (VALUES) with duplicate `memo_stock_id` keys
- Category: vulnerability (business-logic integrity of the Memo Stock ledger)
- Verdict: confirmed by code inspection and documented PostgreSQL `UPDATE ... FROM` semantics. A DB reproduction has not been run.
- Vulnerability severity: Medium. This is silent, persistent corruption of stock availability. It needs only the ordinary `memo-out-return:ADD` and `:APPROVE` grants. No confidentiality impact.

## Evidence and impact

- Affected files and lines:
  - `backend-api-master/src/trade-document/memo-out-return.service.ts:367-382`: approve builds one `puts` entry per return line, using the Memo Out line's `memo_stock_id`, and calls `releaseToMemoStock`.
  - `backend-api-master/src/trade-document/memo-stock.service.ts:57-79`: `releaseToMemoStock` checks each put separately against the item's full `reserved_*` (lines 66-70). It then runs one `UPDATE "memo_stock" AS s ... FROM (VALUES ...) AS r WHERE s.id = r.id` (lines 73-78).
  - `backend-api-master/src/trade-document/memo-schemas.ts:64-72`: duplicates are rejected only by `memoOutLineId`. The migration's unique index `memo_out_return_line_memo_out_line_key` is also per (return, memo out line). Nothing stops two return lines from naming different Memo Out lines that share one Memo Stock item.
- Reachability: Memo Out rejects a duplicate `memoStockId` only within one document (`memo-schemas.ts:33`). Two Memo Outs for the same customer and currency can each take part of the same Memo Stock item. Both lines then show in `memoOutReturn.outstanding`, and one Memo Out Return can include both.
- Trace (example):
  1. Memo Stock item S, pending 3 pcs.
  2. Memo Out A takes 2 pcs of S; Memo Out B takes 1 pcs of S. Both are approved, so S has reserved = 3.
  3. Return R has line 1 (A's line, 2 pcs) and line 2 (B's line, 1 pcs). Approve R.
  4. `puts` = [(S, 2), (S, 1)]. Each put is ≤ 3 on its own, so the check passes.
  5. PostgreSQL docs: when a target row joins more than one `FROM` row, "only one of the join rows will be used to update the target row". So S changes by 2 or by 1, not by 3.
  6. Both Memo Out lines get `returned_*` = full (lines 375-380).
  7. `memo_stock_balance` still holds, because reserved and pending move by the same single amount. So nothing raises an error.
- Impact:
  - 1 or 2 pcs (and their weight) stay in Reserve for good, with no Memo Out line left outstanding that could release them. The stone can't be lent or returned again through the UI.
  - Memo Outstanding reports drift from the Memo Out ledger.
  - The approval is reported as successful.
  - Fixing it needs manual DB correction.
- Same pattern elsewhere: `takeFromMemoStock` (lines 29-49) has the same per-row check and `UPDATE ... FROM` construction. Its callers are protected today by the per-document `memoStockId` duplicate rule (Memo Out `memo-schemas.ts:33`; Memo Return uses unique `memoStockId` lines). Any fix should cover both helpers or assert unique ids.
- Missing validation: there is no DB test yet. IT-MOR-01..06 do not cover two lines sharing one Memo Stock item.

## Proposed work

- Allowed code scope and role: backend. Change `backend-api-master/src/trade-document/memo-stock.service.ts` (and the caller in `memo-out-return.service.ts` if needed), and add tests under `backend-api-master/test/trade-document/`.
- Suggested fix: in `releaseToMemoStock`, and as a guard in `takeFromMemoStock`, sum the puts per `memoStockId` before checking against `reserved_*`, and run the UPDATE on the summed values. A shortage still maps to every contributing line index. No contract, schema or flow change is needed. The result is the same as the approved SA-MOR-17 semantics.
- SA change needed: none, if the fix only aggregates. If you instead forbid two return lines that share a Memo Stock item, the contract changes and needs SA approval.
- Acceptance criteria:
  - Approving a return whose lines share one Memo Stock item moves the summed quantity from Reserve to pending.
  - If the sum is more than `reserved_*`, approval fails with `MEMO_OUT_RETURN_OUTSTANDING_SHORT` and nothing changes.
  - Unit test: the helper aggregates duplicate ids.
  - DB integration test: the IT-MOR scenario above.
- Safe verification: run the existing local-only DB integration harness (`memo-out-return.db.integration.test.ts`, which is guarded to a 127.0.0.1 non-5432 `f1_system` URL). Do not use any shared or live database.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-10-31 "INV-20261031-001 แก้เเละเเก้ยังไง", then "ต่อเลย"
- Approval date: 2026-10-31
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: memo-stock UPDATE...FROM duplicate key under-release
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend (parent session) / HEAD 4ded0ae + working tree | One UPDATE … FROM (VALUES …) joins the same memo_stock row twice; PostgreSQL applies one joined row, and the check compares each line, not the item's total | `totalPerItem` sums lines per `memoStockId` (keeping each line index for error paths); `releaseToMemoStock` and `takeFromMemoStock` check and update per item | Disposable PostgreSQL 18.6: `test/trade-document` 9 files / 61 tests pass, incl. new IT-MOR-07 (two memo outs of one item, one return: both returned, Reserve 0, pending back to 10 / 5.000); UT-MS-T1; unit 419 pass; tsc, eslint clean | Resolved; terminal |

- Assigned owner and start date: backend, 2026-10-31
- Changed files / implementation revision: `backend-api-master/src/trade-document/memo-stock.service.ts`, `test/trade-document/memo-receive.test.ts` (UT-MS-T1), `test/trade-document/memo-out-return.db.integration.test.ts` (IT-MOR-07); uncommitted on `feat/31-10-26-intergrate-memo-out-return`
- Checks performed, results, and limitations: as pass 1. Contract and schema unchanged. The failing case was not run against the unfixed code; the fix is shown by IT-MOR-07 passing.
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
