# INV-20261107-003 — Purchase: after "Don't merge", the Sold row and the In-stock row of the same Stock ID look identical on the form

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase-order/purchase` item table, purchase rev 3 (Don't merge)
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: separate Sold / In-stock rows carry no visible status on the item table; only the merged row has a tag ("Sold + In stock")
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **low–medium (user cannot tell which row is the price-only sold part)**

## Evidence and impact

- Data: Memo Stock 260012 (MR-3, vendor Org, AFN), with Sold 5 and In stock 5.
- Steps to reproduce:
  1. Open a new Purchase and choose vendor V001 · Org.
  2. In Memo Stock, tick both the **Sold** row and the **In stock** row of 260012, then OK.
  3. Choose **Don't merge · keep separate rows**, then **Add 2 rows**.
- Expected: each row shows whether it is the Sold part or the In-stock part. The dialog has just explained that the two behave differently (the Sold row changes only its price).
- Actual:
  - Both rows read exactly "— / 260012 / LOT12 / Memo / DIAMOND … 5 / 5.00 cts / 100.00 AFN" ([38-dont-merge-two-rows.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/38-dont-merge-two-rows.png)).
  - The only way to tell them apart is to open each row panel. The Sold row has Pcs and Weight locked and the note "Sold to customers: 5 pcs / 5.000 cts must be purchased whole" (39-sold-row-panel.png).
  - A merged row, by contrast, shows the tag "Sold + In stock" (34-merged-row.png).
- Rule: purchase revision 3, R3-03 (a Sold row changes Price only). The spec doesn't say how the table marks a separate Sold row, so this is a usability gap, not a broken rule.
- Impact: on a purchase with many stones, the buyer can't see which lines are already sold to customers and must be bought whole.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, in `frontend/src/features/purchase/**`, with tests. The wording and placement need owner or ui-spec confirmation.
- Suggested remediation: show a small "Sold" or "In stock" tag in the first column of separate memo rows, like the merged row's tag. Optionally, reuse the red Sold marker from the picker.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: after Don't merge, each of the two rows shows its status in the table, and the status is still there after Save and reopening.
- Safe verification plan and prerequisites: a component test and a manual re-check. The re-check needs an item with a Sold quantity, which the parent has to prepare because there is no Sale page.

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

- Root cause: only merged rows had a tag in the item table.
- Fix: every Memo Stock row now shows its part next to the Stock ID — "· Sold", "· In stock" or "· Sold + In stock" — also after Save and reopening (the part is saved as the line's memo group). Tests: purchase-merge.test.ts; two existing assertions updated for the tag.
- Checks: frontend 767 tests, typecheck and lint clean.
- Security review (2026-11-07, same uncommitted revision on 26f874b): sec-auditor and security-auditor both clear, no new INV. Note (not a finding): after **Keep vendor** the vendor field itself can stay marked as changed, so the tab may show the unsaved dot.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
