# INV-20261107-007 — Typed weights lose the third decimal and a final 5 always rounds down (0.125 ct becomes 0.12)

## Tracking

- Ticket revision: 1
- Status: deferred (owner 2026-11-09: "ADR-0047 ขอติดไว้ก่อน")
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; `/purchase/purchase-order` row panel Weight (ct) (Purchase Order); other pages using the same row panel not checked
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: the Weight (ct) input of a keyed-in row keeps only two decimals and rounds .xx5 down; picked stock rows show three decimals (5.000) in the row panel
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **low–medium, needs validation (weights of small diamonds are recorded lower than typed)**

## Evidence and impact

- Steps to reproduce:
  1. Open a new Purchase Order, then open empty row 1.
  2. Type each Weight (ct) value below and press Tab after each one.

  | Typed | Shown after leaving the field |
  |---|---|
  | 0.125 | 0.12 |
  | 1.005 | 1.00 |
  | 1.255 | 1.25 |
  | 2.415 | 2.41 |
  | 3.335 | 3.33 |
  | 2.4149 | 2.41 |

- Earlier in the session, PO-4 was saved with a weight typed as 2.415. After Save it still showed **2.41** (18-po-two-rows.png, [81-po-weight-rounding.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/81-po-weight-rounding.png)).
- Expected:
  - A jeweller can enter diamond weights to the third decimal, e.g. 0.125 ct. Memo Stock rows show three decimals: the merged-row panel shows 5.000 and "5.000 cts".
  - If two decimals is the shop's rule, a final 5 should round up (0.125 → 0.13).
- Actual: the third decimal is dropped, and every ".xx5" rounds down.
- Possible cause, for the owner to confirm: the weight places set in Decimal Setup may be 2. Decimal Setup is only a preview kept in this browser. Even so, a half-way value should not always round down.
- Impact: small stones are recorded lighter than typed. Over many lines, purchase weights and amounts come out lower.
- Not checked: other pages that use the same row panel (Quotation and Memo Receive typed rows).

## Proposed work

- Allowed code scope and assigned implementation role:
  - Frontend: weight input formatting.
  - Backend: only if the stored precision is also 2 (needs SA confirmation).
- Suggested remediation: keep the typed precision up to the number of weight places the business uses (3 for diamonds). When a value must be shortened, round half up.
- SA design / contract / flow / dependency change needed: only if the stored weight precision has to change.
- Acceptance criteria:
  - 0.125 stays 0.125, or becomes 0.13 if two places is confirmed as the rule.
  - 2.415 is never shown or saved as 2.41.
- Safe verification plan and prerequisites: the owner first confirms the intended weight places. Then a unit test of the number formatter and a manual re-check.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence: owner 2026-11-09: "แก้ INV-004 ถึง 007 weight เก็บ 4 ตำแหน่ง" (selects the fix and the rule: weight kept to 4 decimals)
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

## Diagnosis and next step (2026-11-09)

- Cause: typing is capped at min(Decimal Setup weight places, 3) (Q-DEC-08); with 2 places 0.125 becomes 0.12. Storage is numeric(12,3) in 22 columns of 9 tables, and the API accepts 3 decimals.
- The owner's rule (4 decimals) changes the schema and every document API, which is outside the approved design, so it needs SA approval first: [ADR-0047](../../adr/0047-weight-four-decimal-places.md) (Proposed).
- 2026-11-09: owner put ADR-0047 on hold ("ADR-0047 ขอติดไว้ก่อน"). Nothing implemented; ADR-0047 stays Proposed.
