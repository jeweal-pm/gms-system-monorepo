# Frontend error handling: vendor

- UI revision: 1
- Pattern: the approved [customer error handling](../customer/error-handling.md). Every row there applies to Vendor with "vendor" wording and the vendor error codes, which SA defines (proposed names in [data-fetching.md](data-fetching.md#requirements-for-the-sa-bundle), SA-VEN-05). Raw server messages are never shown; entered data is kept on every failure.

## Vendor copy

| Situation | Message |
|---|---|
| Code taken (`VENDOR_CODE_TAKEN`, proposed) | Code Name field: "This code name is already in use" |
| Unmapped validation error | Banner: "Some details couldn't be saved. Check the form and try again." |
| Stale update (`VENDOR_STALE`, proposed) | Banner: "Someone else changed this vendor after you opened it. Reload to see the latest version; your changes here will be lost." + **Reload** |
| Save on a deleted vendor | Banner: "This vendor was deleted by someone else." Save hidden; list refreshed |
| Partner unavailable / network / timeout | "Vendor service is unavailable. Nothing was saved. Try again." (no automatic retry) |
| Permission removed | "You don't have permission to {create/edit/delete} vendors." + `permission.mine` invalidated |
| No `vendor:VIEW` | `<h1>` "You don't have access to Vendor" + "Back to Home" |
| Access check failed | "Couldn't check your access to this page." + Retry |
| Options failed | "Couldn't load the list." + Retry under Currency/Country |
| List failed | "Couldn't load vendors." + Retry |
| Open vendor not found | "This vendor no longer exists. It may have been deleted." |
| Delete confirm | Title "Delete {Name}?"; body "The vendor and all of its addresses will be permanently deleted. Documents that already use this vendor keep their own copy of its name. This can't be undone." (wording depends on SA-VEN-05); buttons "Keep vendor" / "Delete" |
| Delete: already gone | Info toast "This vendor was already deleted." |
| Discard confirm | "Discard unsaved changes?" / "Your changes to {Name or 'this vendor'} haven't been saved." / "Keep editing" / "Discard" |
| No default address (only if Q-VEN-03 is answered "no default allowed") | Under the Invoice Address card: "Choose a default invoice address"; item frames red (S4) |
| Address limit | Helper "Up to 10 invoice addresses" |

## Success feedback

| Event | Feedback |
|---|---|
| Created | Toast "Vendor created"; the saved vendor opens in Edit mode |
| Saved | Toast "Vendor saved" |
| Deleted | Toast "Vendor deleted"; back to the draft |
| Duplicated | Toast "Copied from {Name}. Enter a code name if needed, then create the vendor." |

Focus and accessibility rules are the customer rules (focus the first invalid field after expanding items; banners `role="alert"`; dialog focus starts on the safe action; toasts never take focus).
