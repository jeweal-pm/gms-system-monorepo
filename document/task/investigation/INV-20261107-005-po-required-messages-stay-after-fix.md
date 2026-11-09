# INV-20261107-005 — Purchase Order: "Required" and "Add at least one item" stay on screen after the user has fixed them

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase/purchase-order` header and Item heading
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: header/item error messages from a failed Save are not cleared when the field is filled automatically (vendor fills Address) or when items are added
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **low (confusing, does not block Save)**

## Evidence and impact

- Steps to reproduce:
  1. Open a new Purchase Order and press Save with everything empty.
     - Vendor, Address and Due Date show "Required".
     - The Item heading shows "Add at least one item" (11-po-empty-save.png).
  2. Choose vendor V001 · Org. The Address fills itself.
  3. Fill the Due Date and add two item rows.
- Expected: each message disappears once its field is filled.
- Actual:
  - Vendor and Due Date clear.
  - **Address** keeps its red border and "Required" while showing a filled address ([13-vendor-picked.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/13-vendor-picked.png), 14-po-row-panel.png).
  - **"Add at least one item"** stays next to the Item heading after two rows are filled (18-po-two-rows.png).
  - Both messages go away only after the next successful Save.
- Impact: minor, but the page says something is missing when nothing is.
- Not checked: the other pages with a vendor header.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, in the shared vendor header and document form, with tests.
- Suggested remediation: once a Save has been tried, check a field again after it fills itself, and check the "at least one item" rule again whenever rows change.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: with the steps above, no error is visible once Vendor, Address, Due Date and one row are filled.
- Safe verification plan and prerequisites: a component test and a manual re-check.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-09: "แก้ INV-004 ถึง 007 weight เก็บ 4 ตำแหน่ง"
- Approval date: 2026-11-09
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint:
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Final status / date:

## Resolution (2026-11-09, corrective pass 1 of 3, branch `fix/09-11-26-inv`)

- Fix: once a Save has been tried, the address and currency that a vendor choice fills are checked again (their "Required" clears), and "Add at least one item" is checked again as soon as a row is filled (Purchase Order, Memo Receive; the shared vendor header covers Memo Return and Purchase).
- Checks: frontend suite, typecheck and lint clean.
- Security review (2026-11-09, same uncommitted revision on adf5354): sec-auditor and security-auditor both clear, no new INV. Notes (not findings): the server does not itself require a stone on a line (unchanged from before); `lineStoneRule` now tolerates a missing stone / stone code value.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
