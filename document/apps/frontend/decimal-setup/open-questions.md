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

## Revision 2 questions (SA revision 1, 2026-11-03, pending-review)

Owner request 2026-11-03: one global setting for the whole web app, no per-page table, real API. The recommended default
applies if the owner approves SA revision 1 as written. Design: [ADR-0038](../../../adr/0038-global-decimal-setup.md),
[SA bundle](../../backend/master/decimal-setup/architecture.md). Q-DEC-01/02 (page list) are superseded by the global model;
Q-DEC-03 range/defaults are replaced by Q-DEC-08/09; Q-DEC-05/06 are answered by Q-DEC-14 and FE-DEC-104/105.

| ID | Question | Recommended default |
|---|---|---|
| Q-DEC-08 | Allowed range? Storage is money `numeric(18,2)` (74 columns), weight `numeric(12,3)` (16 columns). | **Weight 0–3, price 0–2.** No schema change. Widening to 4 would mean ~90 column type changes with table rewrites, every zod `decimal(p,s)`, both calculators, report SQL and new total-rounding rules — deferred to a separate ADR if ever needed. |
| Q-DEC-09 | Starting values after the migration? | **Weight 2, price 2** (today's display, rev-1 default). Note: weight inputs accept 3 decimals today; with weight 2 new input is capped at 2 until an admin chooses 3. Alternative: weight 3 keeps 3-decimal entry but shows 3 decimals everywhere. |
| Q-DEC-10 | Does the setting limit only what users see and type, or does the server reject extra decimals? | **Display + new keyboard input only.** The server keeps validating at storage scale, stored documents are never rewritten, and an edit field shows a stored value with more decimals unchanged until the user edits that field. |
| Q-DEC-11 | Are totals calculated at the price setting, or still at 2 decimals? | **Still 2 decimals (half-up) on server and client; the display rounds to the setting.** With price < 2 a shown total can differ slightly from the sum of shown lines. Option B (calculate at the setting) needs every document save to read the setting; ask for it as a later revision. |
| Q-DEC-12 | What is not affected? | **Pcs (always 0), percentages (discount %, tax rate), exchange rates, currency buying/selling rates, and the stored precision of net unit price and discount value.** |
| Q-DEC-13 | Who can read the setting? | **Every signed-in, licensed user** (no menu permission), because every page needs it to show numbers. It contains only two numbers. |
| Q-DEC-14 | Who can open and change Decimal Setup? | **Owner answer 2026-11-03: copy from Document Setup.** New permission row "Decimal Setup" (View, Edit) under SETUP (total 360, was 358); a one-time auth data migration gives every user who has `document-setup` VIEW / EDIT the same `decimal-setup` action. Super admin always has it. |
| Q-DEC-15 | How fast do other screens follow a change? | **Immediately in the saving browser (all open tabs); other users on their next page load or when they return to the window after 10 minutes.** |
| Q-DEC-16 | What if the setting cannot be loaded? | **Pages use weight 2 / price 2 without an error banner;** only the Decimal Setup page shows the load error with Retry. |
| Q-DEC-17 | The rev-1 demo stored values in the browser (`gms.decimal-setup.v1`). | **Delete that key on first load and do not import it** (per-page demo values). |
| Q-DEC-18 | Which values count as "weight" and "price"? | **Weight:** every carat weight, including totals and pending/outstanding/returned weights, and labor qty when its basis is weight. **Price:** unit price, amounts, subtotal, discounts as amounts, tax amount, service charges, labor rate/amount, grand total, open value and report totals, including print views; the shown net unit price uses the price places (display only). |

- **Q-DEC-08 changed by the owner 2026-11-03:** "ให้ max decimal ที่ 4", then chose "Choose 0–4, but show only": weight and price places both allow **0–4**. Display shows that many places (a 4th place is 0); typing and storage stay at weight 3 / price 2; server totals stay 2 dp. No column widening.

