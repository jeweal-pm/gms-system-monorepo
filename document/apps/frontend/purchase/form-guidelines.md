# Form guidelines: purchase

- Feature ID / UI revision: `purchase` / 1 (pending-review)
- Base rules: [form-login-guildlines.md](../template/form-login-guildlines.md). The shared document form already follows them (C):
  - A field is checked first when it loses focus, then on every change.
  - Save checks every field and goes to the first error.
  - Save is disabled only while saving.
- The login-only attributes (`autocomplete` for email/password) do not apply here. Numeric fields use `inputMode="decimal"` / `"numeric"` (C `NumberInput`).

| Field | Rule | Error message |
|---|---|---|
| Doc Date \* | Valid date; default today | "Required" |
| Vendor \* | One of the vendor options | "Required" |
| Address \* | One of the chosen vendor's addresses | "Required" |
| Due Date \* | Valid date, on or after Doc Date (Q-PU-10) | "Required" / "Due Date must be on or after Doc Date" |
| Currency \* | One of the currency options | "Required" |
| Exchange Rate | Read-only, filled from the currency (Q-PU-13) | — |
| Ref. | Optional, trimmed, ≤ 100 | "Up to 100 characters" |
| Rows | At least 1 filled row; ≤ 200 rows | "Add at least one item" |
| Row Pcs | Whole number ≥ 0. On a Memo Stock row: > 0 unless Weight > 0, and ≤ the item's pending (Q-PU-04) | "More than the pending {n} pcs" |
| Row Weight (ct) | Decimal, 3 dp, ≥ 0. On a Memo Stock row: ≤ pending | "More than the pending {n} ct" |
| Row Price | Decimal, price places; required and > 0 on every filled row (Q-PU-04) | "Enter the price" |
| Row line discount | % ≤ 100, or an amount ≤ the line amount (C `DiscountPair`) | shared messages |
| Item Note | ≤ 500 (C) | shared |
| Document Note | ≤ 250, with counter (E) | "Up to 250 characters" |
| Summary Discount / Tax / charges | As Quotation (C) | shared |

Number fields allow typing and then show an error. They are not blocked silently, except that Pcs keeps digits only (C). Values are trimmed before checking.
