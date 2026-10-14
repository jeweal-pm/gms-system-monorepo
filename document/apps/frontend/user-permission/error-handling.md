# Frontend error handling: user-permission

- UI revision: 1
- API/domain error mapping: pending SA contract ([handoff](../../../coordination/handoffs/user-permission-sa.md)). The existing license error codes (`LICENSE_REQUIRED/EXPIRED/REVOKED/UNVERIFIABLE`) keep their approved handling.

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Submit Create User | Required field empty | Field error state (S2): red fill/border/label and italic message "{Field} is required" | Fix the field; the error clears on change | Focus the first invalid field; `aria-invalid`, `aria-describedby` | FE-UP-005 |
| Submit | Password < 4 or > 64 | Field error with the policy message | Fix the field | Same | FE-UP-005 |
| Submit | Phone invalid for the country | Field error (copy pending Q-UP-09) | Fix the field | Same | FE-UP-004/005 |
| Submit | No Location | Field error "Location is required" (proposed) | Select a location | Same | FE-UP-005 |
| Photo select | Wrong type / too large | Error under the tile (proposed) | Choose another file | Message announced via `aria-live="polite"` | FE-UP-013 |
| Create | Username already exists (server) | Field error on Username (copy from SA) | Change the username | Focus Username | FE-UP-012 |
| Create | User limit reached (server) | FormError banner above the form: limit reached (copy pending Q-UP-05) | None, or contact support | `role="alert"` | FE-UP-012 |
| Create | Email has no issued license (if C-02 applies) | FormError banner (copy from SA/owner) | Contact sales/support | `role="alert"` | FE-UP-012 |
| Create/Save | Network/5xx | FormError "Couldn't save the user. Try again." (proposed). The form keeps all values except Password, which is kept until success. | Retry the submit | `role="alert"` | FE-UP-012 |
| Load list / user / catalog | Failure | Inline error in the drawer or matrix + Retry button | Retry | Retry button focusable | FE-UP-006/007 |
| Select another user / Refresh with a dirty form | Unsaved changes | Confirm dialog (proposal, Q-UP-19) | Keep editing / Discard | Modal focus rules | FE-UP-015 |
| Delete | Server failure | Dialog stays open; the danger button returns to "Delete"; inline error inside the dialog | Retry or "Keep user" | Error inside the dialog with `role="alert"` | FE-UP-009 |
| Delete | Not allowed (Super Admin/self, if prohibited) | Delete trigger hidden or disabled with a reason in a tooltip (pending Q-UP-15) | none | `aria-disabled` + description | FE-UP-009 |
| Any | 401 session expired | Existing AppShell redirect to `/login` | Sign in | n/a | existing |
| Any | 403 not authorized for this page | Page-level state "You don't have access to User and permission" (proposed) | Back to Home | `<h1>` announces the state | FE-UP-014 |
| Any | License 403/503 | Existing license routing (unchanged contract) | per license spec | n/a | existing |

Rules: never show stack traces, raw server messages, password values or license tokens. Toasts are
not used for field errors. The success toast after Duplicate is shown in S5. Success after
create/save/delete is not shown in the source; the proposal is a `success` toast ("User created",
"User deleted"), awaiting owner confirmation through the review of this document.

Links: [form guidelines](form-guidelines.md), [ui-spec](ui-spec.md), [testing](testing.md).
