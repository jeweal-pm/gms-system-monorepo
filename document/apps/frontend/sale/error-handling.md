# Frontend error handling: sale

- UI revision: 1 (pending-review)
- API/domain error mapping: requested from SA ([handoff](../../../coordination/handoffs/sale-sa.md)); expected codes follow the `<CODE>_*` pattern with code prefix `SALE` (ADR-0050 `APPROVAL_DOCUMENTS`).

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open page | No `sale:VIEW` | Page text "You don't have permission to view sales." | — | text in main region | FE-SL-002 |
| Open saved | Not found / load error | "Sale not found." / shared domain error text | Refresh, back to daybook | — | FE-SL-002 |
| From Reserve | No customer or currency | Toast "Choose a customer first" / "Choose a currency first" | choose them | focus stays on the button | FE-SL-004 |
| From Reserve / Stock dialog | List fails | Inline error in the dialog + Retry | Retry | Retry focusable | FE-SL-004/005 |
| Change customer or currency with From Reserve rows | Rows belong to the old customer/currency | Confirm "Changing the customer clears N rows picked From Reserve." (app confirm modal) | Cancel keeps the old value | focus returns to the field | FE-SL-003 |
| Save | Field / row invalid | Field messages; toast "Row n: …" naming the first bad row (C) | fix the field | scroll to first error | FE-SL-003 |
| Save | `exceeds_open` / `exceeds_pending` on a line | Row error "Only x pcs / y ct are available" on Pcs / Weight | lower the quantity | row panel field | FE-SL-006 |
| Save | Reference invalid (reserve line not approved, other customer/currency, stock item gone) | Row error "This item is no longer available. Remove the row." | remove row | — | FE-SL-006 |
| Save / Submit / Delete | Version conflict | "This sale was changed by someone else. Refresh to see the latest." Edits kept | Refresh | toast `role=status` | FE-SL-006 |
| Approve (Approve page) | Short at approve | "Some items no longer have enough available. Edit the row and approve again." Document unchanged | creator revises | — | FE-SL-009 |
| Any | Deleted elsewhere (`SALE_DELETED`) | Reload read-only with deleted banner (C) | Restore if allowed | — | FE-SL-006 |
| Any | Approval setting changed / status invalid | ADR-0050 shared messages (C `approvalFlow.handleError`) | Refresh | — | FE-SL-006 |
| Any | Session expired / 403 | Shared auth handling (C) | sign in again | — | — |

Entered data is preserved on every server error. No stack traces or internal ids are shown.
