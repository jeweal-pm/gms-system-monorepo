# Error handling: currency

| Domain code | When | UI |
|---|---|---|
| `VALIDATION_ERROR` | bad field; non-base currency without a rate (`sellingRate`/`buyingRate` `required`) | field message; banner "Some details couldn't be saved…" when a path is unknown |
| `CURRENCY_CODE_TAKEN` (409) | code already exists | Code Name: "This code is already used" |
| `CURRENCY_CHANGED` (409) | stale `expectedUpdatedAt` | banner + Reload (stale) |
| `CURRENCY_NOT_FOUND` (404) | deleted elsewhere | banner "This record no longer exists."; delete → toast "already deleted" |
| `CURRENCY_BASE_LOCKED` (409) | turning off Active on the base currency | Active: "The company currency is always active" |
| `CURRENCY_IN_USE` (409) | delete while Company Profile, a vendor or a customer uses it | dialog: "This currency is used by other records. Turn off Active instead." |
| `PERMISSION_DENIED`, license, `UNAUTHORIZED` | shared | shared Stone Master messages; recheck `permission.mine` |
| `currencyCode` `unknown` (Company Profile / Vendor / Customer save) | chosen currency is inactive or deleted | "Choose an active currency from the list" and refetch the options |

Loading: skeleton rows in the drawer, a card skeleton while a record loads, `DetailLoadError` with Retry.
