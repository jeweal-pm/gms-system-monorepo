# Open questions: approve-center revision 1

Owner request 2026-11-07 with sources 01/02. Items marked **requires SA** need a separate SA bundle and approval before any code depends on them.

**Revision 1 approved by the owner on 2026-11-07** in chat ("อนุมัติ เริ่มทำเลย"). The owner answered Q-AP-01, Q-AP-02 and Q-AP-03; every other question takes its default. The "Answer" column records the decision.

| ID | Question | Default in revision 1 | Answer (2026-11-07) |
|---|---|---|---|
| Q-AP-01 | **Reject…** — no document in use can be rejected (only Quotation has a `reject` → `REJECTED` procedure, unused). What should Reject do: a new `REJECTED` final status, back to editable, or cancel? Reason required? Can a rejected document be edited and resubmitted? Does it release anything? | Button shown **disabled** with "Reject isn't available yet". **requires SA** | **Owner**: Reject closes the document with a final **REJECTED** status and a **required reason**. Needs new backend statuses/procedures (SA, in progress). Phase 1: disabled, tooltip "Reject is coming soon". |
| Q-AP-02 | **Revise…** — no document has a revise step. Does it send the document back to its creator for changes (e.g. a `REVISION_REQUESTED` status with a note)? Why is Revise disabled on the second row of the design (info icon)? | Button shown **disabled** with "Revise isn't available yet". **requires SA** | **Owner**: Revise sends the document back to its creator to edit, **with a note**; the creator then resubmits. Needs new backend statuses/procedures (SA, in progress). Phase 1: disabled, tooltip "Revise is coming soon". |
| Q-AP-03 | Where do Memo Receive, Memo Return, Memo Out, Memo Out Return go in the panel? The design does not show them. | After Transfer Location, in that order (owner text lists "memo" last). Alternative: sidebar order (Quotation, Reserve, Memo…, PO, Purchase, inventory). | **Owner**: the sidebar order: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location. |
| Q-AP-04 | What does `/approve` (sidebar Approve) open? | First visible menu with pending documents, else the first visible menu. | Default. |
| Q-AP-05 | The sidebar badge reads 10 while the visible counts add to 8. What does the sidebar number count? | Sum of the counts of all visible panel items (memo counts included). | Default. |
| Q-AP-06 | Quotation "off": is it permanent (Quotation never needs approval), or a per-company switch that can be turned on later? | Permanent "off" from code; Quotation menu shows the source 01 empty state. A switch would need SA. | Default. |
| Q-AP-07 | Load to Stock, Merge/Split Stock, Transfer Location have no page. Show them now (with "Not available yet") or hide them until they exist? | Show them with the "Not available yet" state and provisional columns; no count. | Default. |
| Q-AP-08 | Should Sale (and Stock Adjustment) appear in Approve when those pages exist? | Not included (owner list does not name them). | Default. |
| Q-AP-09 | Should Approve ask for confirmation? What do the checkboxes do (bulk Approve only, or also bulk Reject)? | Confirm dialog on each Approve; bulk bar with **Approve selected** only, processed one by one. | Default. |
| Q-AP-10 | Layout: keep the expanded main sidebar *and* the Approve panel (design), or collapse the main sidebar to the rail like Setup › Partner master? Tablet/mobile behaviour? | As designed at ≥ 1280 px; rail + panel at 1024–1279; panel becomes a select below 1024. | Default. |
| Q-AP-11 | Default order and sortable columns? (The design shows a sort icon on Action and Status.) | Oldest submitted first; sort on Document, Detail, Qty, Value, Submitted; none on Status/Action. | Default. |
| Q-AP-12 | The Pending badge (`#FFAB00` on `#FFE7B8`) and the Revise label (`#FFAB00` on white) fail WCAG AA contrast. May text use the darker existing `#9A5B00`? | Yes: text `#9A5B00`, backgrounds/borders as designed. | Default. |
| Q-AP-13 | Who sees each Approve item? | Users with `<document>:APPROVE` (Super Admin sees all). The list itself also needs `<document>:VIEW`. | Default. |
| Q-AP-14 | "Submitted" shows "Mint (Sales)". Is "Sales" the user's role/position from User and Permission, and is "submitted" the time the document was saved as pending (create or last edit)? | Name + role from the auth service; submitted = last save that put it in Pending. Phase 1 shows "—" and the last-saved time. **requires SA** | Default. |
| Q-AP-15 | Search "stone, Stock ID": search inside the lines? | Yes, phase 2. Phase 1 searches no., party name and Ref. only. **requires SA** | Default. |
| Q-AP-16 | Should Approve show documents the approver created themselves? (Today the creator may approve their own document.) | Yes, same as the document pages. | Default. |

## Revision 2 (document preview modal, 2026-11-10)

| ID | Question | Default | Status |
|---|---|---|---|
| Q-AP-17 | Value column currency: THB as designed (line amount × rate) or the document currency? | THB as designed | **Answered** 2026-11-10 (owner): THB as designed; a document already in the company currency shows its own amounts. |
| Q-AP-18 | Do Reject… / Revise… work in the modal? | Disabled like the table (backend phase 2 on hold) | **Answered** 2026-11-10 (owner): disabled like the table. |
| Q-AP-19 | Does clicking the number still open the full page, or only the modal? | Modal + an "Open document" link | **Answered** 2026-11-10 (owner): **modal only**; no way to open the full page from Approve. |
| Q-AP-20 | The design's "Ordered" / "New from vendor" texts under Stone have no matching data. What should the sub line show? | `{color} · {clarity}`; no sub-header | **Answered** 2026-11-10 (owner): the customer name, under a sub-header "Ordered by"; vendor documents show neither (owner chose "Hide it on vendor docs"). |
| Q-AP-21 | The total row: sum of the lines, or the document grand total (after discount, tax, charges)? | Sum of the lines; a "Grand total" line under the table only when it differs | **Answered** 2026-11-10 (owner): OK (the default). |
