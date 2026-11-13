# INV-20261031-002 — Memo approvals lock with FOR UPDATE and can deadlock with FK-checked line inserts

## Tracking

- Ticket revision: 2 (2026-11-04: Purchase approve added as a further instance of the same lock pattern; root cause, verdict and remediation unchanged)
- Status: resolved (2026-11-13, pass 1; see Resolution)
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
  - Revision 2 addition (sec-auditor, focused pre-handoff review of purchase BE-PU-002…004, 2026-11-04; source HEAD `279d4ad` + uncommitted working tree; `backend-api-master/src/purchase/purchase-stock.ts` blob fd1fa0cb; `backend-api-master/prisma/migrations/20261104150000_purchase/migration.sql` blob 949187d1): `purchase-stock.ts:179-186` (`takeForPurchase`, run by `purchase.approve`) locks `memo_stock` rows `ORDER BY id FOR UPDATE` and `purchase_order_line` rows `FOR UPDATE OF l`, while `purchase.create` / `update` insert `purchase_line` rows in user line order with FKs `purchase_line.memo_stock_id -> memo_stock.id` and `purchase_line.purchase_order_line_id -> purchase_order_line.id` (`migration.sql:194,197`), each taking `FOR KEY SHARE`. A purchase save naming items M2 then M1 against another purchase's approve (or a Memo Out / Memo Out Return / Memo Return approve, which lock `memo_stock` the same way) locking M1 then M2 forms the same 40P01 cycle. Integrity is preserved: `takeForPurchase` re-guards every key under lock before its single bulk UPDATE, and `memo_stock_balance` / `memo_stock_purchased_check` remain backstops; the 40P01 surfaces as `DEPENDENCY_UNAVAILABLE` (503) and a retry succeeds. The same `FOR NO KEY UPDATE` change applies to both purchase lock queries.
- Attacker prerequisites and reachable entry point: no attacker needed; two authorized users acting concurrently (`memoOutReturn.create/update` with memo-out-return ADD/EDIT and `memoOutReturn.approve` with APPROVE; likewise `memoOut.create/update` against `memoOut.approve`/`memoOutReturn.approve`).
- Concrete trust boundary and source-to-sink trace: each inserted child row's FK check takes `FOR KEY SHARE` on the referenced parent row, row by row in insertion (user line) order. `FOR UPDATE` conflicts with `FOR KEY SHARE`, while `FOR NO KEY UPDATE` does not. Example: Tx A saves a pending return whose lines reference Memo Out lines L2 then L1 (KEY SHARE L2, then waits for L1); Tx B approves another return that locks L1 then L2 in id order (holds L1 FOR UPDATE, waits for L2). This is a lock cycle, and PostgreSQL aborts one transaction with 40P01 after `deadlock_timeout`. The same pattern applies to `memo_stock`: a Memo Out save inserting From Stock lines (KEY SHARE on memo_stock in line order) against Memo Out / Memo Out Return / Memo Return approval (FOR UPDATE in id order). Even without a cycle, approvals needlessly block concurrent saves that only reference those rows, for up to the 4 s `WRITE_TX` timeout.
- Observed impact and independent verification evidence: static analysis only. Integrity is preserved: approval re-checks outstanding and reserved quantities under lock, and `memo_out_line_returned_check` and the memo stock balance CHECKs remain as backstops. The impact is an occasional failed save or approval (500/transient error, retry succeeds) and short head-of-line blocking on the 2 vCPU host. No over-return or cross-customer effect was found.
- Missing validation fact / capability (if any): not reproduced against PostgreSQL; a two-session DB integration test would confirm the 40P01 cycle.
- Sanitized evidence sufficient for owner review: yes (file/line trace above).
- Raw report/run links: none (focused review).

## Proposed work

- Allowed code scope and assigned implementation role: backend; `backend-api-master/src/trade-document/memo-out-return.service.ts`, `memo-stock.service.ts`, `backend-api-master/src/purchase/purchase-stock.ts` (revision 2), related tests.
- Suggested remediation: the locks only update non-key columns, so use `FOR NO KEY UPDATE` instead of `FOR UPDATE` in the approve and memo-stock lock queries. The same row serialization between approvals remains, and the FK KEY SHARE conflict goes away. Optionally map 40P01/40001 to the existing retryable conflict error instead of a 500.
- SA design / contract / flow / dependency change needed: none (lock mode only; SA-MOR-17 semantics unchanged).
- Acceptance criteria: concurrent return save + return approve over overlapping Memo Out lines in opposite order completes without 40P01; existing over-return/short-reserve tests still pass.
- Safe verification plan and prerequisites: local test DB integration test with two concurrent transactions; no production data.

## User selection and approval

- Approved ticket revision: current
- Actual user instruction / approval evidence: owner 2026-11-13: "แก้ไข INV-20261031-002" — fix now
- Approval date: 2026-11-13
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `explicit-FOR-UPDATE-vs-FK-KEY-SHARE:memo_out_line,memo_stock`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / `2126ec01` + working tree | Approve and stock locks take `FOR UPDATE`, which conflicts with the FK `KEY SHARE` that concurrent line inserts take in user line order → 40P01 cycle (reproduced as the control in IT-MOR-08) | the non-key row locks → `FOR NO KEY UPDATE` | IT-MOR-08 two-session test + full master/auth suites on disposable PostgreSQL 18.6: pass | resolved |

- Assigned owner and start date: backend, 2026-11-13.
- Changed files / implementation revision: branch `fix/12-11-26-inv`, base `2126ec01` + uncommitted working tree. See Resolution (pass 1).
- Checks performed, results, and limitations: see Resolution (pass 1).
- Follow-up auditor and verification evidence: security reviews are routed once by the parent on the final revision.
- Remaining risk or reopened validation gap: see Resolution (pass 1).
- Completion report under document/task/done/: [2026-11-13 INV fixes](../done/2026-11-13-inv-fixes.md)
- Final status / date: resolved, 2026-11-13.

## Resolution (pass 1)

- Change: every row lock that only updates non-key columns now uses `FOR NO KEY UPDATE` instead of `FOR UPDATE`. It still serializes approvals of the same rows (NO KEY UPDATE conflicts with itself), but no longer conflicts with the FK `KEY SHARE` of concurrent line inserts, so the save-vs-approve cycle cannot form.
  - `backend-api-master/src/trade-document/memo-out-return.service.ts` `lockOutLines` (memo_out_line; Memo Out Return approve and reversal).
  - `backend-api-master/src/trade-document/memo-stock.service.ts` `takeFromMemoStock` and `releaseToMemoStock` (memo_stock; Memo Out, Reserve, Memo Return and Memo Out Return approvals and reversals).
  - `backend-api-master/src/purchase/purchase-stock.ts` `takeForPurchase` (memo_stock and `purchase_order_line … FOR NO KEY UPDATE OF l`) and the purchase reversal (memo_stock, purchase_order_line).
- Checked and kept: the `memo-receive.service.ts` reversal keeps `FOR UPDATE` on memo_stock because it **deletes** those rows (a key change that must conflict with FK KEY SHARE). `source-lock.ts` / document-engine keep source headers `FOR SHARE` (INV-20261111-002 F1): `FOR SHARE` conflicts with the source writer's `FOR NO KEY UPDATE` header bump, so the auto-approved delete race stays serialized; IT-AS-B15 passes unchanged. Document Setup numbering, company profile and approval setting `FOR UPDATE` locks are not part of this cycle and were left as they are.
- 40P01 / 40001 mapping: not changed. They already surface as the retryable `DEPENDENCY_UNAVAILABLE` (503), not a 500, and the save/approve cycle no longer occurs.
- Tests:
  - `test/trade-document/memo-out-return.db.integration.test.ts` IT-MOR-08 (new, two sessions). Control: a session holding the FK `KEY SHARE` on the higher line and then asking for the lower one, against the old `FOR UPDATE` id-order lock, gets 40P01. Fix: while session A holds `KEY SHARE` on the higher line, the real `memoOutReturn.approve` over both lines (lower → higher) completes without waiting; A then takes the lower line and commits; no 40P01; returned quantities are correct. Then the real services in parallel (a save naming the lines high → low next to an approve): both succeed.
  - `test/trade-document/memo-stock-locks.test.ts` UT-LOCK-01/02 (new): take/release lock `FOR NO KEY UPDATE` in id order. `test/purchase/purchase-stock.test.ts` lock assertions updated.
  - Existing over-return / short-reserve tests (IT-MOR-04/05/07, IT-MO, IT-PU, IT-AS-B15) pass.
- Verification: fresh disposable PostgreSQL 18.6 — master 725 passed / 15 skipped, auth 111 / 6; tsc and eslint clean.
- Remaining risk: none new. A source edit that replaces lines while a dependent locks them can still be aborted by the deadlock detector (noted in INV-20261111-002; unrelated to this lock mode).
