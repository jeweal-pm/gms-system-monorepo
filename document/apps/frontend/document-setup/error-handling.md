# Frontend error handling: document-setup

- UI revision: 1 (pending-review)
- API/domain error mapping: proposed in [data-fetching.md](data-fetching.md) (requires-sa)

| User action | Error / condition | Feedback | Recovery | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Save | field invalid | inline under the field/cell; red border | fix and Save again | focus first invalid field; `aria-invalid`, `aria-describedby` | FE-DS-005 |
| Save | `DOCUMENT_SETUP_CODE_TAKEN` (409) | inline on Code: "This code is already used" | change Code | focus Code | FE-DS-005 |
| Save | `DOCUMENT_SETUP_CHANGED` (409, someone saved first) | form banner "Someone else changed this setup. Reload to see the latest." + Reload button | Reload discards local edits after confirm | banner `role="alert"` | FE-DS-005 |
| Save | row already used by documents changed/removed (Q-DS-06) | inline on that row: "This row is already used by documents and can't be changed" | undo the change | focus the row | FE-DS-005 |
| Save | permission lost (`PERMISSION_DENIED`) | toast error "You no longer have permission to edit document setup"; return to view mode | — | toast `role="alert"` | FE-DS-005 |
| Save / load | service unavailable / network | toast error "Couldn't save. Try again." (entered data kept) / load: `DetailLoadError` with Retry | Retry | — | FE-DS-003, 005 |
| Load list | failed | inline in drawer "Couldn't load transactions" + Retry | Retry | — | FE-DS-002 |
| Switch transaction / Cancel | unsaved changes | existing discard dialog "Discard changes?" | Keep editing / Discard | focus returns to the trigger | FE-DS-006 |
| Open page | no VIEW | existing access guard (tile hidden; direct URL shows "No access") | — | — | FE-DS-007 |

Session expiry and license errors use the app-wide handling already in place.
