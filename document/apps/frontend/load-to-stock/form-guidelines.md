# Form guidelines: load-to-stock

- UI revision: 1 (draft). Follows the project [form guidelines](../template/form-login-guildlines.md) and [purchase/form-guidelines](../purchase/form-guidelines.md).

| Field | Required | Input restriction | Validation timing |
|---|---|---|---|
| Doc Date | yes | date picker dd/MM/yyyy | on blur + Save |
| Account | yes | select (Q-LS-01) | on change + Save |
| Currency | yes | select | Save |
| Ref. | no | ≤ 100 chars | on input count |
| Location | yes per row | select (Q-LS-11) | Save (row error) |
| Parcel | no | ≤ 50 chars (A) | on input |
| Pcs | yes | integer ≥ 1, digits only; ≤ remaining (None/Split); locked in Merge | on blur + Save |
| Weight (ct) | yes | decimal > 0, Decimal Setup places; ≤ remaining | on blur + Save |
| Stock Price | yes; starts empty (owner Q-LS-13) | decimal ≥ 0, THB | on blur + Save |
| Sale Price | yes; starts empty (owner Q-LS-13) | decimal ≥ 0, THB | on blur + Save |
| Item note | no | Purchase limit (C) | counter |
| Document Note | no | 250 (A) | counter |

- Save button shows "Saving…" and is disabled while busy (prevents double submit). Send to approve follows `approval-flow.tsx` (C).
- First error: focus the field; for a table row, open its panel and name "Row n: …" (C, INV-20261102-003).
- Number inputs use `inputMode="decimal"` / `"numeric"`, `autoComplete="off"`.
