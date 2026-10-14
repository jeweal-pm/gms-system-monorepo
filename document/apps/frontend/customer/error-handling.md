# Frontend error handling: customer

- UI revision: 1
- API/domain error mapping: [ADR-0018](../../../adr/0018-customer-master-partner-service.md) §2 error codes (`CUSTOMER_NOT_FOUND` 404, `CUSTOMER_CODE_TAKEN` 409, `CUSTOMER_STALE` 409, `VALIDATION_ERROR` 400 + field errors, `PARTNER_UNAVAILABLE` 502/503) plus the existing gateway codes (`UNAUTHORIZED`, `PERMISSION_DENIED`, `LICENSE_*`). Permission failures use `PERMISSION_DENIED` and nested field errors use paths like `invoiceAddresses.1.postcode`, per the SA draft [api-contract.md](../../backend/partner/customer/api-contract.md) (revision 1, pending-review; SA-CUS-04/07).
- Pattern: user-permission error mapping (`frontend/src/features/user-permission/api.ts`, `mapCreateError` / `mapDeleteError` / `loadErrorMessage`).

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Submit (Create/Save) | Required field empty / too long / bad format | Field error state (S1): red fill/border/label, italic message under the field; the containing address item frame turns red (DV-12) and shows "Has errors" when collapsed | Fix the field; the error clears on change | Expand items with errors; focus the first invalid field; `aria-invalid`, `aria-describedby` | FE-CUS-008 |
| Submit | Phone entered but invalid | Field error "Enter a valid phone number" (S1 shows a Phone error) | Fix or clear the number | Same | FE-CUS-008 |
| Submit | State/City empty while Country is empty | Only Country shows "Country is required" (State/City are disabled) | Choose a country | Same | FE-CUS-008 |
| Create/Save | `CUSTOMER_CODE_TAKEN` | Code Name field error "This code name is already in use" | Change the code name | Focus Code Name | FE-CUS-015 |
| Create/Save | `VALIDATION_ERROR` with `fieldErrors` | Each mapped path → that field's error (expanding its item). Unmapped paths → FormError banner "Some details couldn't be saved. Check the form and try again." | Fix the fields | Focus the first mapped field; banner `role="alert"` | FE-CUS-015 |
| Create/Save | `VALIDATION_ERROR` code `unknown` on `currencyCode` / `*.countryCode` | Field error "Choose a currency from the list" / "Choose a country from the list"; options are refetched | Choose again | Focus that field | FE-CUS-015 |
| Create/Save | `VALIDATION_ERROR` code `multiple_defaults` on `invoiceAddresses` / `shippingAddresses` (should not happen; the UI keeps one default) | Banner "Only one default address is allowed per type." | Fix the default checkbox | `role="alert"` | FE-CUS-015 |
| Save | `CUSTOMER_STALE` | FormError banner "Someone else changed this customer after you opened it. Reload to see the latest version; your changes here will be lost." with a **Reload** button. Form values stay until Reload. | Reload (resets to the server data) or copy values first | Banner `role="alert"`; Reload is the next focusable element | FE-CUS-015 |
| Save | `CUSTOMER_NOT_FOUND` | Banner "This customer was deleted by someone else." The list is refreshed; Save is hidden for this record. | Duplicate it as a new customer (if ADD) or pick another | `role="alert"` | FE-CUS-015 |
| Create/Save/Delete | `PARTNER_UNAVAILABLE`, 5xx, network, timeout | Banner (form) or dialog error "Customer service is unavailable. Nothing was saved. Try again." All values kept. **No automatic retry** (ADR §2). | Retry the action manually | `role="alert"` | FE-CUS-015 |
| Any action | `PERMISSION_DENIED` (permission removed mid-session) | Banner/dialog "You don't have permission to {create/edit/delete} customers." and `permission.mine` is invalidated so buttons update | none | `role="alert"` | FE-CUS-004, 015 |
| Any | `UNAUTHORIZED` | "Your session has ended. Sign in again."; existing `AppShell` session redirect still applies | Sign in | — | existing |
| Any | Caller `LICENSE_*` | "Your license doesn't allow this right now. Nothing was saved." (same as user-permission; no license routing exists on this page) | per license spec | — | FE-CUS-015 |
| Open page | No `customer:VIEW` | Page state `<h1>` "You don't have access to Customer" + "Back to Home"; no `customer.*` request | Back to Home | `<h1>` announces the state | FE-CUS-004 |
| Open page | `permission.mine` fails | "Couldn't check your access to this page." + Retry | Retry | `role="alert"` | FE-CUS-004 |
| Load options | Failure | Under Currency/Country: "Couldn't load the list." + Retry link; the form stays usable for other fields; Create/Save still validates (Currency/Country required) | Retry | link focusable | FE-CUS-006, 007 |
| Load list / next page | Failure | Inline in the drawer "Couldn't load customers." + Retry (next page: the loaded rows stay, retry row at the end) | Retry | Retry button focusable | FE-CUS-009 |
| Open customer | `CUSTOMER_NOT_FOUND` | Inline "This customer no longer exists. It may have been deleted." (no Retry); list refreshed | Pick another / New customer | `role="alert"` | FE-CUS-014 |
| Open customer | Other failure | Inline message + Retry; the form is not shown with stale data | Retry | `role="alert"` | FE-CUS-014 |
| Delete | `CUSTOMER_NOT_FOUND` | Close the dialog; info toast "This customer was already deleted."; list refreshed; back to the draft | none | toast polite | FE-CUS-012 |
| Delete | Other failure | Dialog stays open; button returns to "Delete"; inline error inside the dialog | Retry or "Keep customer" | error `role="alert"` inside the dialog | FE-CUS-012 |
| Refresh / switch / duplicate / new | Unsaved changes | ConfirmDialog "Discard unsaved changes?" body "Your changes to {Name or 'this customer'} haven't been saved." Buttons "Keep editing" / "Discard" | Keep editing / Discard | Focus starts on "Keep editing"; Esc = keep | FE-CUS-010 |
| Close or reload the tab | Unsaved changes | Native `beforeunload` prompt | — | browser | FE-CUS-010 |
| Add address | 10 already | Button disabled + helper "Up to 10 invoice addresses" | Remove one first | helper linked with `aria-describedby` | FE-CUS-007 |

## Success and other states

| Event | Feedback |
|---|---|
| Created | Toast success "Customer created"; the saved customer opens (Edit mode); drawer row selected |
| Saved | Toast success "Customer saved"; form reset to the refreshed customer (not dirty) |
| Deleted | Toast success "Customer deleted"; back to the draft (or the empty state without ADD) |
| Duplicated | Toast info "Copied from {Name}. Enter a code name if needed, then create the customer." |
| Address removed | No toast (immediate and visible); focus moves to the previous item header |

Rules: never show stack traces, raw server messages, internal URLs or the service token. Toasts are not
used for field errors. Entered data is preserved on every failure; only Reload/Discard/Refresh replace it.

Links: [form guidelines](form-guidelines.md), [ui-spec](ui-spec.md), [data fetching](data-fetching.md), [testing](testing.md).
