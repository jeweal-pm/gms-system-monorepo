# INV-20261102-002 — Memo Out Return: Return Pcs/Weight start empty and Pcs doesn't fill Weight

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-02)
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective full-system check
- Date and audit scope: 2026-11-02; `/memo/memo-out-return` (UI spec memo-out-return revision 4)
- Source commit, dirty paths, and relevant content hashes: `feat/02-11-26-manual-tester` @ `4753205`, clean tree
- Related ticket / root-cause fingerprint: lines picked from the Memo Outstanding dialog get empty return quantities; no proportional weight fill
- Category: functional defect (spec mismatch)
- Verdict: not-applicable
- Functional severity: **medium** (extra typing on every line; error-prone for weights)

## Evidence and impact

- Steps to reproduce:
  1. Memo › Memo Out Return, then Create New.
  2. Choose customer CM01. The currency becomes THB.
  3. Press Memo Outstanding, tick 260006 (4 pcs / 2.05 ct) and 260007 (3 pcs / 1.50 ct), then OK.
  4. Look at the Return columns.
  5. Type 2 in Return Pcs of row 1.
- Expected:
  - The UI spec ([memo-out-return/ui-spec.md](../../apps/frontend/memo-out-return/ui-spec.md), revision 4, Item table) says: "Return Pcs / Weight are the only editable cells, ≤ Outstanding, **default = Outstanding**".
  - Memo Out and Memo Return fill the Weight in proportion when Pcs is typed. A user expects the same here.
- Actual:
  - Return Pcs and Weight are empty (placeholders 0 / 0.00), and the Amount is 0.00 (screenshot `document/testing/user-check/artifacts/2026-11-02-full-system/mor-04-return-cells.png`).
  - After typing 2 pcs, the Weight stays empty, so it has to be typed by hand.
- Observed with test data MT-MOR-001 (2026-11-02).

## Proposed work

- Allowed code scope and assigned implementation role: frontend, `src/features/memo-out-return/**` and the shared return-table code, with tests.
- Suggested remediation:
  - Set Return Pcs/Weight to the row's Outstanding when it is added from the dialog.
  - Make Pcs fill Weight in proportion (outstanding weight × pcs ÷ outstanding pcs), as Memo Out and Memo Return do.
- SA design / contract / flow / dependency change needed: no. This is already in the approved revision 4.
- Acceptance criteria:
  - Picked rows show Return = Outstanding.
  - Typing Pcs fills Weight in proportion, and Weight stays editable.
  - Unit tests cover both.
- Safe verification plan and prerequisites: a manual re-check on the dev stack with an approved Memo Out to the customer.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-02 "แก้ INV-20261102-002 กับ 003 ต่อเลย"
- Approval date: 2026-11-02
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint:
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | frontend, parent session / `feat/02-11-26-manual-tester` @ 4753205 | Return rows start empty (`outstandingToLine` pcs / weight "") and the memo out return table has `autoWeight: false` | `outstandingToLine` starts Return at Outstanding; Memo Out Return table `autoWeight: true`; the shared auto-weight uses the exact Outstanding weight when all pcs come back and never goes above it (`return-item-table.tsx`) | frontend tsc, eslint 0 errors, 54 files / 534 tests pass (UT-MOR-21 updated). Auto-weight in the browser not re-clicked in this pass | Resolved; terminal |

- Final status / date:
