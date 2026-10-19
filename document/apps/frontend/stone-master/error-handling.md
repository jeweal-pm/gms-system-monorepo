# Error handling: stone-master (UI revision 1)

The domain codes are proposed in the [SA bundle](../../backend/partner/stone-master/decisions.md). The UI copy below is what the user sees.

| Code / case | Where | UI |
|---|---|---|
| `VALIDATION_ERROR` + field errors | save | Message under each mapped field. Unmapped errors show the banner "Some details couldn't be saved. Check the form and try again." |
| `STONE_MASTER_CODE_TAKEN` | save | Code field: "This code is already used" (Stone Code page: "This stone code is already used") |
| `STONE_MASTER_REFERENCE_INVALID` (inactive/missing group, size, part, size not in shape) | save | The field that was named: "Select an active {part}"; the options are refetched |
| `STONE_MASTER_CHANGED` (stale `expectedUpdatedAt`) | update | Banner: "This record was changed by someone else. Cancel to load the latest version, then edit again." |
| `STONE_MASTER_NOT_FOUND` | get / update / delete | "This record no longer exists." The list is refreshed and the page returns to Add mode. |
| `STONE_MASTER_IN_USE` | delete | Inside the delete dialog: "This {page} is used by other records. Turn off Active instead." |
| `PERMISSION_DENIED` | any | Load: "You don't have permission to view Stone Master." Save/Delete: "You don't have permission to do this. Nothing was saved." Access is checked again. |
| `PARTNER_UNAVAILABLE`, network, timeout | any | Load: "Couldn't load {subject}." with Retry. Save: "Couldn't save. Try again." Nothing is lost from the form. |
| `UNAUTHORIZED` / license codes | any | Existing shared copy (session ended / license). |

Announcements: the banners use `role="alert"`, the toasts use the existing ToastProvider, and the move message after a part reorder uses `aria-live="polite"`.
