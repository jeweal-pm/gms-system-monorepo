# INV-20261107-002 — Purchase: choosing a vendor again (even the same one) silently removes every Memo Stock and Purchase Order row

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase-order/purchase` header and item table
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: any vendor selection on Purchase clears picked rows, including re-selecting the current vendor; no confirm and no message
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **medium (picked rows and their edited quantities/prices are lost without warning)**

## Evidence and impact

- Steps to reproduce:
  1. Open a new Purchase and choose vendor **V001 · Org** (currency AFN).
  2. Add a row in either way, and optionally change its Pcs or Price:
     - **Memo Stock**: tick one item, then OK.
     - **Purchase Order**: tick one PO line, then OK.
  3. Open the Vendor list again and click **V001 · Org**, the same vendor. Repeat with a different vendor.
- Expected:
  - Picking the same vendor changes nothing.
  - Picking a different vendor first asks, for example "Changing the vendor removes the N rows taken from Memo Stock and Purchase Order. Continue?", or at least says what was removed.
- Actual:
  - Every Memo Stock and Purchase Order row disappears at once, with no question and no message. Keyed-in rows stay ([59-vendor-change.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/59-vendor-change.png)).
  - The same happens in Edit mode on a saved Purchase.
  - With a different vendor, the currency also switched from AFN to AED by itself. The keyed-in row's price of 100 stayed, now shown as 100.00 AED.
- Rule: purchase revision 2, R2-04, says a vendor change clears picked rows ([ui-spec](../../apps/frontend/purchase/ui-spec.md#r2-01-page-changes)). It doesn't cover choosing the same vendor again, and it gives no warning text.
- Impact: buyers often reopen a dropdown just to check the vendor. That silently loses every picked row, including merge choices and adjusted quantities and prices.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, in `frontend/src/features/purchase/**` and the shared vendor header if needed, with tests.
- Suggested remediation:
  - Do nothing when the chosen vendor is the current one.
  - When the vendor really changes and picked rows exist, ask before clearing them and say how many rows will be removed.
- SA design / contract / flow / dependency change needed: no, this is front-end behaviour only. The confirm wording needs owner or UI approval.
- Acceptance criteria:
  - Choosing the same vendor again keeps all rows.
  - Changing the vendor while picked rows exist asks first. Cancel keeps the old vendor and the rows.
- Safe verification plan and prerequisites: a component test and a manual re-check.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-07: "77 file change เยอะไป ลบรูปไปบางส่วน แก้ INV-20261107-002 และ INV-20261107-001 และ INV-20261107-003"
- Approval date: 2026-11-07
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

## Resolution (2026-11-07, corrective pass 1 of 3)

- Root cause: the shared vendor header ran its vendor-change steps on every pick, including the vendor already chosen; Purchase then cleared its picked rows without asking.
- Fix: choosing the vendor that is already chosen changes nothing (all vendor documents). On Purchase a real change asks "Change the vendor?" with the number of rows taken from Memo Stock / Purchase Orders and any currency switch; **Keep vendor** restores the old vendor and keeps the rows. Tests: `pickedRowCount`, `vendorChangeConfirm` (purchase-merge.test.ts).
- Checks: frontend 767 tests, typecheck and lint clean.
- Security review (2026-11-07, same uncommitted revision on 26f874b): sec-auditor and security-auditor both clear, no new INV. Note (not a finding): after **Keep vendor** the vendor field itself can stay marked as changed, so the tab may show the unsaved dot.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
