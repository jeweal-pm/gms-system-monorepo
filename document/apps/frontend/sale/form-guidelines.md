# Form guidelines: sale

- UI revision: 1 (pending-review)
- Base: the project [form guidelines template](../template/form-login-guildlines.md) and the shared `DocumentForm` behaviour (C).

| Field | Rule | Timing |
|---|---|---|
| Doc Date | required, valid date; default today | onBlur, then onChange once invalid; all on Save |
| Customer | required, active customer (a saved inactive one is kept in the list) | as above |
| Shipping / Invoice Address | required, the customer's addresses | as above |
| Due Date | required, ≥ Doc Date (Q-SL-11) | as above |
| Currency | required; Exchange Rate = Selling Rate, read-only, required for a foreign currency | as above |
| Ref. | optional, trimmed, ≤ 100 | — |
| Rows | at least one filled row; ≤ 200 | on Save |
| Pcs / Weight | > 0, ≤ the row's cap (open reserve or pending stock); `inputMode="numeric"` / `decimal`; Pcs fills Weight in proportion | onBlur / onChange after error |
| Sale Price | required, > 0, price places from Decimal Setup | as above |
| Line discount | ≥ 0 and ≤ line amount (C) | as above |
| Document Note | ≤ 250, counter (C) | — |

- Save is never disabled for invalid input; it is disabled only while saving ("Saving…").
- Save validates everything, scrolls to the first error and names the first bad row (C, INV-20261102-003).
- Values are trimmed before validation. Every input keeps a visible label.
