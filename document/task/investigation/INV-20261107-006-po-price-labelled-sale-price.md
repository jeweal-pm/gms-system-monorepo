# INV-20261107-006 — Purchase Order: the buying price is labelled "Sale Price"

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase/purchase-order` item table and row panel
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: the PO item table column and row-panel field reuse the Quotation label "Sale Price"; the PO UI spec says Price
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **low (wording; may confuse staff and printed documents later)**

## Evidence and impact

- Steps to reproduce: open a new Purchase Order, then look at the item table header and at the Quantity & Price section of the row panel.
- Expected: the price we pay the vendor is labelled **Price**. The Purchase page uses that label, and so does the Purchase Order spec ("Price Unit, Price, Discount …", [ui-spec](../../apps/frontend/purchase-order/ui-spec.md#items)).
- Actual: both the table column (sub-label "Unit") and the row-panel field read **Sale Price** ([10-po-new.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/10-po-new.png), 17-row1-filled.png). The Purchase page correctly says "Price".
- Impact: wording only. Still, a purchase order that says "Sale Price" confuses buyers, and it will confuse the vendor once the document can be printed.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, in `frontend/src/features/purchase-order/**` or the shared label setting, with tests.
- Suggested remediation: use "Price" in the Purchase Order item table and row panel.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: the Purchase Order shows "Price" in the table and in the row panel. Quotation, Reserve and Memo Out keep "Sale Price".
- Safe verification plan and prerequisites: a component test and a visual re-check.

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

- Fix: Purchase Order sets its price title to "Price" (table column and row panel); Quotation, Reserve and Memo Out keep "Sale Price". Test: test/purchase-order/inv-20261107.test.ts.
- Checks: frontend suite, typecheck and lint clean.
- Security review (2026-11-09, same uncommitted revision on adf5354): sec-auditor and security-auditor both clear, no new INV. Notes (not findings): the server does not itself require a stone on a line (unchanged from before); `lineStoneRule` now tolerates a missing stone / stone code value.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
