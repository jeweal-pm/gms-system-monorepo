# INV-20261029-001 — Memo Out Return save fails on a real database (outstanding columns missing)

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (schema/migration decision may need sa)
- Priority: awaiting user review
- Auditor / mode / run ID: found by backend during memo-receive rev 3 integration tests (not an audit)
- Date and audit scope: 2026-10-29; `backend-api-master` trade-document engine and `memo_out_return_line`
- Source commit, dirty paths, and relevant content hashes: branch `feat/29-10-26-integrate-memo-receive` on e1b8bcb plus uncommitted memo-receive rev 3 changes; the defect comes from commit 688d501 ("feat: memo out return ui")
- Related ticket / root-cause fingerprint: engine writes Prisma fields that are absent from the model (`memo_out_return_line.outstanding_*`)
- Category: not a security finding; functional/data defect
- Verdict: not-applicable

## Evidence and impact

- Affected files:
  - [document-engine.ts:396](../../../backend-api-master/src/trade-document/document-engine.ts#L396) writes `outstandingPcs` and `outstandingWeightCt` to the line rows.
  - [memo-schemas.ts:26](../../../backend-api-master/src/trade-document/memo-schemas.ts#L26) requires them in the input.
  - `prisma/schema.prisma` model `MemoOutReturnLine` and migration `20261028090000_memo_out` have no such columns.
- Observed impact: `memoOutReturn.create` and `memoOutReturn.update` against PostgreSQL fail with Prisma "Unknown argument `outstandingPcs`". So Memo Out Return cannot be saved on a real database.
- Why tests missed it: the memo-out-return unit tests mock Prisma. The memo-receive DB integration test (IT-MR-08) therefore checks the DRAFT regression through Memo Out instead.

## Proposed work

- Allowed code scope and assigned implementation role: backend. `prisma/schema.prisma`, a new additive migration, `src/trade-document/**` and tests.
- Suggested remediation: either add nullable `outstanding_pcs` / `outstanding_weight_ct` columns to `memo_out_return_line` (the memo-out contract returns them on detail lines, UI rev 3), or stop persisting them. The first matches the approved [memo-out contract](../../apps/backend/master/memo-out/api-contract.md), which already lists them, so no new SA approval should be needed. Confirm when selecting.
- Acceptance criteria: a DB integration test creates, updates and gets a Memo Out Return with outstanding values.
- Safe verification plan: a throwaway PostgreSQL container, as used for IT-MR-*.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
