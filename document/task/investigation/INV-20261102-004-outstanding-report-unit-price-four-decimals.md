# INV-20261102-004 — Memo Outstanding › Vendor shows a unit price the user never entered (1,234.4995 instead of 1,234.50)

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-02)
- Owner: frontend (display); backend to confirm which price the report should return
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective full-system check
- Date and audit scope: 2026-11-02; `/memo/memo-outstanding/vendor`, expanded item rows
- Source commit, dirty paths, and relevant content hashes: `feat/02-11-26-manual-tester` @ `4753205`, clean tree
- Related ticket / root-cause fingerprint: the item PRICE / UNIT column shows the Memo Stock net unit price (line amount ÷ weight, 4 dp) instead of the entered unit price. This is separate from [INV-20261029-003](INV-20261029-003-memo-stock-net-unit-price-overflow.md), which is about column width.
- Category: functional / display defect
- Verdict: not-applicable
- Functional severity: **low** (it confuses the user and doesn't match other screens; totals are correct)

## Evidence and impact

- Steps to reproduce:
  1. Memo Receive: one line at 5.125 ct, 1,234.50 AED per ct, no discount, giving the amount 6,326.81. Save and Approve (test data MR-2 / Stock ID 260006).
  2. Memo › Memo Outstanding › Vendor, then expand MR-2.
- Expected: the diamond line's PRICE / UNIT reads **1,234.50 AED per cts**, as typed. The Memo Return "Add Memo Stock" dialog shows exactly that.
- Actual: **1,234.4995 AED per cts** (screenshot `document/testing/user-check/artifacts/2026-11-02-full-system/mov-02-expanded.png`). 6,326.81 ÷ 5.125 gives 1,234.4995. Every other money value on the page has 2 decimals.
- The open value (7,125.68 AED) and the KPI are correct.

## Proposed work

- Allowed code scope and assigned implementation role: frontend (format or choose the price field). Backend only if the report should return the entered unit price instead of the derived net price.
- Suggested remediation:
  - Show the entered unit price, net of the line discount where one applies, with the document's 2 money decimals.
  - Or round the derived price for display. The owner decides which price this column means.
- SA design / contract / flow / dependency change needed: only if the report contract has to add the entered unit price.
- Acceptance criteria:
  - Item rows show a 2-dp price that matches Memo Receive and Memo Return for the same Stock ID.
  - Totals are unchanged.
- Safe verification plan and prerequisites: a manual re-check with MR-2, plus a report formatting unit test.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-02 "แก้ INV-20261102-004 - 5    INV-20261029-001 แก้เสร็จเเล้วปิด ticket เลย"
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
| 1 | frontend, parent session / `feat/02-11-26-manual-tester` @ 4753205 + uncommitted INV-20261102-001…003 fixes | Report shows the stored net unit price (amount ÷ weight, 4 dp) unformatted | `formatUnitPrice` in `memo-outstanding-vendor/model.ts` rounds it half up to 2 dp on the string (1,234.4995 → 1,234.50); used by the table and the print view. Contract unchanged | frontend tsc, eslint 0 errors, 55 files / 537 tests pass; dev pages via nginx 200 (UT-MOV-P1 new). Not re-clicked in the browser in this pass | Resolved; terminal |

- Final status / date: resolved 2026-11-02
