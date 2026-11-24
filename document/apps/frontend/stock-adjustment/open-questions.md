# Open questions: stock-adjustment (UI revision 1)

Status: **approved, all defaults applied** (owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more)). These are now decisions, not questions. Already answered by the owner on 2026-11-24: Price is shown in Stock, Physical and Diff, and From Stock lists the Main Location only (see [ui-spec](ui-spec.md)). Every row below gives a **recommended default**. Approving revision 1 "with the defaults" accepts all of them.

| ID | Question | Recommended default | Alternatives | Affects |
|---|---|---|---|---|
| Q-SAJ-01 | Does the **Physical Price replace** the lot's price when the document takes effect? Which field: `stock_price` (shown price) or `unit_cost_base` (cost used by Stock Value)? | **Yes. Physical Price becomes `stock_price`.** `unit_cost_base` is unchanged and only the on-hand quantity changes. Cost amount follows the quantity (`cost_amount_base` = new on hand × unit cost). | Also replace `unit_cost_base`; or Price is display-only | S-03, ADR-0059 D6 |
| Q-SAJ-02 | Default of the Physical Price input | **The Stock Price** (so leaving it alone means no price change) | Empty and required | G grid |
| Q-SAJ-03 | Change Main Location when rows exist | Confirm, then **clear all rows** | Block the change | I-02 |
| Q-SAJ-04 | The lot changed between pick and effect | **Refuse** the row (409) and ask the user to re-pick | Silently re-base Stock to the current value | S-05, ADR-0059 D5 |
| Q-SAJ-05 | Add row / manual rows | **None.** Pick only (empty row opens From Stock) | Allow a manual stone row (new stock) | G |
| Q-SAJ-06 | Barcode scan target | Stock ID or Lot at the Main Location | Stock ID only | P-02 |
| Q-SAJ-07 | Row with no difference | Allowed; posts no movement (records "counted, OK") | Refuse with "no change" | S-02 |
| Q-SAJ-08 | Edit / delete after it took effect | Allowed while no later document used that Stock ID since; reverse first | Never editable after effect | S-07, ADR-0059 D7 |
| Q-SAJ-09 | Approve Center panel | **Yes**, when approval is ON (replaces the Q-AP-08 default "no") | Approve only from the document page | S-08 |
| Q-SAJ-10 | Print / Excel / Duplicate | Disabled in rev 1 | Build now (no design) | H-02 |
| Q-SAJ-11 | Same Stock ID on two open adjustments | Allowed. The second one to take effect fails the S-05 check unless the first set it to the same value | Lock the Stock ID while a Draft/Pending adjustment holds it | ADR-0059 D5 |
| Q-SAJ-12 | Max rows per document | **200** (same bound as other lot pickers) | 500 | ADR-0059 D10 |
