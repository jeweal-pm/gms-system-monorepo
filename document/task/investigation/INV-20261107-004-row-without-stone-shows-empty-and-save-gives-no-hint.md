# INV-20261107-004 — Purchase Order: a keyed-in row without a stone is shown as "Empty row" and Save only says "Please complete the required fields"

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase/purchase-order` item table and row panel
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: a typed row with lot / pcs / weight / price but no Stone is displayed as an empty row and counts 0 in Totals; the failed Save marks no row and no field. Related to the resolved INV-20261102-003 (row errors on Save), but a different case: the table treats the row as empty
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **medium (user is stuck: nothing on the page shows what is missing)**

## Evidence and impact

- Steps to reproduce:
  1. Open a new Purchase Order.
  2. Click empty row 1. In the row panel, type Lot "NO-STONE-LOT", PCS 2, Weight 0.5 and Price 100.
  3. Leave Stone Code and Stone empty, then close the panel.
  4. Choose vendor V002 · Org and a Due Date, then press **Save**.
- Expected:
  - The row shows what I typed.
  - Save says something like "Row 1: choose the stone", with the row and the field marked.
- Actual:
  - After the panel closes, row 1 still reads "Empty row · click to key in". Totals show 0 / 0.00 / 0.00 AED. Reopening the row shows the typed values are still there.
  - Save shows only the toast "Please complete the required fields". No row, field or heading is marked, and the Stone field in the row panel isn't red ([82-po-row-without-stone-save.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/82-po-row-without-stone-save.png), 83-po-row-without-stone-panel.png).
- Rule: the Purchase Order UI spec, Errors, says "Field errors name the row: 'Row N: …'" ([ui-spec](../../apps/frontend/purchase-order/ui-spec.md)).
- Related ticket: INV-20261102-003 (resolved) added "Row N: …" for invalid rows. This row is treated as empty, so that message never appears.
- Impact: the user can't find what blocks Save. A stone typed without a stone name is invisible in both the table and the totals.
- Not checked: Quotation typed rows, which use the same row panel.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, in the shared item table, row panel and document form (`frontend/src/features/trade-document/**`, `frontend/src/features/purchase-order/**`), with tests.
- Suggested remediation:
  - Treat a row with any typed value as filled: show its values in the table and count them in Totals.
  - On Save, name the problem, for example "Row 1: choose the stone".
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: with the steps above, the table shows row 1's values, and Save shows a row-specific message pointing to the missing stone.
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

- Fix: a row with any typed detail (lot, Pcs, Weight, Price, note, photo …) now counts as filled — it shows in the table and in Totals — and a filled row needs its stone (`lineStoneRule`, "Choose the stone") on Purchase Order, Quotation, Memo Receive and the shared document rules. Save names the row ("Row 1: Choose the stone") on Purchase Order and Memo Receive as on the other pages, and the row is marked in the table. Test: test/purchase-order/inv-20261107.test.ts.
- Checks: frontend suite, typecheck and lint clean.
- Security review (2026-11-09, same uncommitted revision on adf5354): sec-auditor and security-auditor both clear, no new INV. Notes (not findings): the server does not itself require a stone on a line (unchanged from before); `lineStoneRule` now tolerates a missing stone / stone code value.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
