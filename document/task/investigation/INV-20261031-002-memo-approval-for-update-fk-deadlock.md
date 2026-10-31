# INV-20261031-002 — Memo approvals lock with FOR UPDATE and can deadlock with FK-checked line inserts

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, not a full audit) / no run tree
- Date and audit scope: 2026-10-31; memo-out-return revision 4 + memo-out revision 3 uncommitted working tree (approve, outstanding, save paths)
- Source commit, dirty paths, and relevant content hashes: HEAD 4ded0ae2bb9efa15b4d39704e5a2fd7d1c81e4f2 + uncommitted changes; `backend-api-master/src/trade-document/memo-out-return.service.ts` blob baf283ba; `backend-api-master/src/trade-document/memo-stock.service.ts` blob 645b55b2; `backend-api-master/prisma/migrations/20261101090000_memo_out_return_customer/migration.sql` blob a145ff1c
- Related ticket / root-cause fingerprint: none; `explicit-FOR-UPDATE-vs-FK-KEY-SHARE:memo_out_line,memo_stock`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-master/src/trade-document/memo-out-return.service.ts:361-363` — approve locks `memo_out_line` rows with `SELECT ... ORDER BY id FOR UPDATE`.
  - `backend-api-master/src/trade-document/memo-stock.service.ts:59-62` (new `releaseToMemoStock`) and `:31-34` (existing `takeFromMemoStock`) — `memo_stock` rows locked with `FOR UPDATE`.
  - `backend-api-master/prisma/migrations/20261101090000_memo_out_return_customer/migration.sql:52` — new FK `memo_out_return_line.memo_out_line_id -> memo_out_line.id`; `20261031090000_memo_out_from_stock/migration.sql:37` — FK `memo_out_line.memo_stock_id -> memo_stock.id`.
  - `backend-api-master/src/trade-document/document-engine.ts:413` — lines saved with one `createMany` in client line order.
- Attacker prerequisites and reachable entry point: no attacker needed; two authorized users acting concurrently (`memoOutReturn.create/update` with memo-out-return ADD/EDIT and `memoOutReturn.approve` with APPROVE; likewise `memoOut.create/update` against `memoOut.approve`/`memoOutReturn.approve`).
- Concrete trust boundary and source-to-sink trace: each inserted child row's FK check takes `FOR KEY SHARE` on the referenced parent row, row by row in insertion (user line) order. `FOR UPDATE` conflicts with `FOR KEY SHARE`, while `FOR NO KEY UPDATE` does not. Example: Tx A saves a pending return whose lines reference Memo Out lines L2 then L1 (KEY SHARE L2, then waits for L1); Tx B approves another return that locks L1 then L2 in id order (holds L1 FOR UPDATE, waits for L2). This is a lock cycle, and PostgreSQL aborts one transaction with 40P01 after `deadlock_timeout`. The same pattern applies to `memo_stock`: a Memo Out save inserting From Stock lines (KEY SHARE on memo_stock in line order) against Memo Out / Memo Out Return / Memo Return approval (FOR UPDATE in id order). Even without a cycle, approvals needlessly block concurrent saves that only reference those rows, for up to the 4 s `WRITE_TX` timeout.
- Observed impact and independent verification evidence: static analysis only. Integrity is preserved: approval re-checks outstanding and reserved quantities under lock, and `memo_out_line_returned_check` and the memo stock balance CHECKs remain as backstops. The impact is an occasional failed save or approval (500/transient error, retry succeeds) and short head-of-line blocking on the 2 vCPU host. No over-return or cross-customer effect was found.
- Missing validation fact / capability (if any): not reproduced against PostgreSQL; a two-session DB integration test would confirm the 40P01 cycle.
- Sanitized evidence sufficient for owner review: yes (file/line trace above).
- Raw report/run links: none (focused review).

## Proposed work

- Allowed code scope and assigned implementation role: backend; `backend-api-master/src/trade-document/memo-out-return.service.ts`, `memo-stock.service.ts`, related tests.
- Suggested remediation: the locks only update non-key columns, so use `FOR NO KEY UPDATE` instead of `FOR UPDATE` in the approve and memo-stock lock queries. The same row serialization between approvals remains, and the FK KEY SHARE conflict goes away. Optionally map 40P01/40001 to the existing retryable conflict error instead of a 500.
- SA design / contract / flow / dependency change needed: none (lock mode only; SA-MOR-17 semantics unchanged).
- Acceptance criteria: concurrent return save + return approve over overlapping Memo Out lines in opposite order completes without 40P01; existing over-return/short-reserve tests still pass.
- Safe verification plan and prerequisites: local test DB integration test with two concurrent transactions; no production data.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `explicit-FOR-UPDATE-vs-FK-KEY-SHARE:memo_out_line,memo_stock`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
