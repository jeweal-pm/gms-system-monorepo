# Open questions: decimal-setup (UI revision 1)

Defaults apply if the owner approves revision 1 as written.

| ID | Question | Default in revision 1 |
|---|---|---|
| Q-DEC-01 | Which pages are listed? | The 15 transactions that Document Setup lists (Quotation … Receivable). |
| Q-DEC-02 | Pages without weight (Payable, Receivable) — hide the weight setting? | Yes, shown as "—". |
| Q-DEC-03 | Default places? Allowed range? | Weight 2, price 2; each 0–4. |
| Q-DEC-04 | Rounding when fewer places are shown? | Half-up (same as the quotation totals today). |
| Q-DEC-05 | Who can see/edit the page? There is no `decimal-setup` permission yet. | Mock phase: reuse `document-setup` (VIEW to open, EDIT to change). A `decimal-setup` leaf (VIEW, EDIT) is added when the API is built. |
| Q-DEC-06 | Should Quotation (and later pages) use these settings now? | No — this revision is the Setup page only; wiring the pages comes with the API. |
| Q-DEC-07 | Does "price" also cover amounts/totals (Amount, Subtotal, Grand Total), or only the unit price? | Covers all money values on that page. |
