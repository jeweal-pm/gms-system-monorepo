# INV-20261102-005 — Exchange Rate field: label reads "1 THB = ? AED" and overlaps its value when space is tight

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-02)
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective full-system check
- Date and audit scope: 2026-11-02; the shared document header on Quotation, Memo Receive, Memo Return, Memo Out and Memo Out Return
- Source commit, dirty paths, and relevant content hashes: `feat/02-11-26-manual-tester` @ `4753205`, clean tree
- Related ticket / root-cause fingerprint: the Exchange Rate label template keeps a literal "?", and the header grid doesn't adapt when the row panel narrows the form
- Category: display / layout defect
- Verdict: not-applicable
- Functional severity: **low**

## Evidence and impact

Screenshots are under `document/testing/user-check/artifacts/2026-11-02-full-system/`.

- Steps to reproduce:
  1. Memo Out (or Quotation / Memo Out Return): choose customer CM01, whose currency is THB.
  2. Read the Exchange Rate field. The label is "Exchange Rate (1 THB = ? AED)" and the value is 35.0000 (`mo-04-save-no-price.png`).
  3. Memo Receive at 1440×900: choose vendor V001 (currency AFN), then click an empty item row so that the row panel opens. The label "Exchange Rate (1 AFN = ? AED)" wraps over the value "100.0000" (`mr-02-row-panel.png`).
  4. Memo Receive at 1280×800 with the row panel open: the Vendor box shows only "Select", the Exchange Rate label overlaps its box, Delete wraps to a second line, and the item table shows only the Stock ID column (`layout-1280-memo-receive-panel.png`).
- Expected:
  - The label shows the actual relation, for example "1 THB = 35.0000 AED", or simply "Exchange Rate (AED per THB)".
  - The header stays readable when the row panel is open on a normal desktop width.
- Actual: the "?" reads as "unknown rate", and the label covers the value in narrower layouts.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, the shared document header and form layout, with tests.
- Suggested remediation:
  - Change the label wording so it has no "?".
  - Let the header grid wrap to fewer columns when the row panel is open, or below about 1300 px, so labels never overlap values.
- SA design / contract / flow / dependency change needed: no (UI only; ui-spec may confirm the wording).
- Acceptance criteria:
  - No "?" in the label.
  - At 1280 and 1440 px, with and without the row panel, the labels don't overlap values, and Vendor/Customer show their chosen name.
- Safe verification plan and prerequisites: manual screenshots at 1280 and 1440, plus a component test of the label text.

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
| 1 | frontend, parent session / `feat/02-11-26-manual-tester` @ 4753205 + uncommitted INV-20261102-001…003 fixes | Label template keeps a literal "?"; the label is absolutely placed and wraps over the value; the header grid follows the window, not the form width | `exchangeRateLabel` ("Exchange Rate (AED per 1 THB)") in the Quotation / Memo Out / Memo Out Return, Memo Receive and Memo Return headers; `Field` label stays on one line and ends in "…" (full text as tooltip); header grids use container queries (1 → 2 → 4 columns by the form's own width) | frontend tsc, eslint 0 errors, 55 files / 537 tests pass; dev pages via nginx 200 (UT-DOC-H1 new). 1280 / 1440 px screenshots not retaken in this pass | Resolved; terminal |

- Final status / date: resolved 2026-11-02
