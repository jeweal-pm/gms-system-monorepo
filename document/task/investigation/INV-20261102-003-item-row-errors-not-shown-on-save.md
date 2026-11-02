# INV-20261102-003 — Save error doesn't point to the item line or field that is wrong (Memo Out, Memo Out Return, Memo Return)

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-02)
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective full-system check
- Date and audit scope: 2026-11-02; `/memo/memo-out`, `/memo/memo-out-return`, `/memo/memo-return` item tables
- Source commit, dirty paths, and relevant content hashes: `feat/02-11-26-manual-tester` @ `4753205`, clean tree
- Related ticket / root-cause fingerprint: line-level validation errors are kept in the row panel or the cell border only. The table and the toast give no line or field hint, and there is no error text in the cells.
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **medium** (users can't find what blocks Save on documents with many lines)

## Evidence and impact

Screenshots are under `document/testing/user-check/artifacts/2026-11-02-full-system/`.

- Steps to reproduce:
  - **Memo Out:**
    1. New document, customer CM01.
    2. From Stock: tick 260006 and 260007, then OK.
    3. Fill the Due Date and leave the sale prices empty.
    4. Save.
    - Result: only the toast "Please complete the required fields". No row or cell is marked in the table (`mo-04-save-no-price.png`, `mo-05-scrolled-right.png`). Opening row 2 finally shows "Enter the sale price" (`mo-06-row-panel.png`).
  - **Memo Out Return:**
    1. Pick two rows from Memo Outstanding.
    2. In row 1, type Return Pcs 2 and leave the Weight empty. Leave row 2 empty.
    3. Fill the Due Date and Save.
    - Result: the same toast, with nothing marked (`mor-06-save-row2-empty.png`).
  - **Memo Out Return and Memo Return:** typing a Return Pcs above Outstanding (5 of 4, or 9 of 8) turns the cell border red, but no text such as "More than outstanding" is visible (`mor-05-over-outstanding.png`).
- Expected:
  - The faulty rows and cells are highlighted, and the message says what to fix, for example "Row 2: enter the sale price".
  - The Memo Return UI spec says the cell turns red with "Enter the return quantity" or "More than outstanding" ([memo-return/ui-spec.md](../../apps/frontend/memo-return/ui-spec.md), Item table). Memo Out revision 2 gives the message "Enter the sale price".
- Actual: a generic toast only. The user has to open rows one by one.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, the shared trade-document form and item tables (`src/features/trade-document/**`, `src/features/memo-*/**`), with tests.
- Suggested remediation:
  - On a failed Save, mark the invalid rows and cells in the table, and show the field message as visible text or a tooltip.
  - Name the first bad row in the toast, or scroll to it.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: for each case above, the user can see which row and field is wrong without opening the row panel.
- Safe verification plan and prerequisites: a manual re-check on the dev stack, plus component tests.

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
| 1 | frontend, parent session / `feat/02-11-26-manual-tester` @ 4753205 | `handleSubmit` invalid callback shows a fixed toast; item table never reads form errors; return cells show the reason only as a `title` | `lineErrorMessages` / `invalidSaveMessage` in `document-form.tsx`: toast "Row N: <message>", selects the first bad row and opens its row panel where there is one; `ItemTable` `rowErrors` tints the row and shows "Row N: …" under it; return cells show the message under the input (Memo Out Return and Memo Return) | frontend tsc, eslint 0 errors, 54 files / 534 tests pass (UT-DOC-E1/E2 new). Not re-clicked in the browser in this pass | Resolved; terminal |

- Final status / date:
