# Frontend error handling: purchase

- UI revision: 1 (pending-review)
- API/domain error mapping: proposed codes `PURCHASE_*` (requires-sa), mapped with the shared `mapDocumentSaveError` (C). The final list comes from the SA api-contract.

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open the page | No `purchase:VIEW` | Page text "You don't have permission to view purchases." | — | — | FE-PU-002 |
| Open `/purchase-order/purchase/<id>` | Not found / no access / service down | Page text "Purchase not found." or the shared load message | Sidebar / Create New | — | FE-PU-003 |
| Save | Missing header field (Doc Date, Vendor, Address, Due Date, Currency) | "Required" under the field; toast "Please complete the required fields" | Fix the field | Focus goes to the first invalid field (C) | FE-PU-002 |
| Save | Due Date before Doc Date | "Due Date must be on or after Doc Date" (C wording) | Change the date | field | FE-PU-002 |
| Save | No filled row | "Add at least one item" by the Item title (C) | Add a row or Memo Stock | — | FE-PU-002 |
| Save | Bad row (no stone, Pcs/Weight 0, over pending, no Price) | The row line in red + "Row n: …" (C, INV-20261102-003); toast "Row n: …"; the row panel opens on that row | Fix the row | Row panel opens on the row | FE-PU-002/004 |
| Save / Approve | Memo Stock pending is now short (another document took it), e.g. `PURCHASE_PENDING_SHORT` | Toast naming the row, and the row is marked; nothing is saved or approved | Lower the quantity or remove the row | Row selected | FE-PU-003/004 (requires-sa) |
| Save / Delete / Approve | Stale version (`*_STALE`) | Toast "This purchase was changed by someone else. Refresh to see the latest." The user's edits are kept. | Refresh (asks first if there are unsaved edits) | — | FE-PU-003 |
| Save / Delete | Already approved (`*_STATUS_INVALID`) | Toast "This purchase is approved and can no longer be changed." | Refresh | — | FE-PU-003 |
| Save | Vendor or Memo Stock item from another vendor or currency | Field error on Vendor / the row | Choose again | field | FE-PU-003/004 |
| Memo Stock button | No vendor or currency yet | Toast "Choose a vendor first" / "Choose a currency first" (C) | Choose them | — | FE-PU-004 |
| Memo Stock dialog | Load fails / empty | In the dialog: error text / "No memo stock from this vendor in {currency}." (C) | Close or retry the search | Escape closes (C) | FE-PU-004 |
| Purchase Order button | PO not available | Disabled + tooltip "Purchase Order isn't available yet" | — | `aria-describedby` reason | FE-PU-001/002 |
| Any write | Session expired / no permission (`UNAUTHORIZED` / `FORBIDDEN`) | Shared session / permission message (C) | Sign in again | — | FE-PU-003 |
| Any write | Service unavailable | Toast with the shared transient message; edits kept; tRPC `retryTransient` for reads (C) | Try again | — | FE-PU-003 |
| Cancel / Refresh / leave the tab | Unsaved changes | App confirm "Discard unsaved changes?" (Keep editing / Discard) (C). The tab shows a dirty dot (C). | — | Focus returns to the trigger | FE-PU-002 |

Messages never show stack traces, SQL or internal IDs. Entered data is kept after every failed write.
