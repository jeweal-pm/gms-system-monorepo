# Error handling: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

| Code | When | UI |
|---|---|---|
| `VALIDATION_ERROR` 400 | bad filters, page, sort or ids. The UI never sends these normally. | The filters reset to defaults and the page reloads once. If it fails again, the error banner shows. |
| `PERMISSION_DENIED` 403 | no VIEW | Standard no-access page |
| `UNAUTHORIZED` 401 | no session | Go to sign-in |
| `AUTHORIZATION_UNAVAILABLE` 503 / network | auth view or service unavailable | Banner "Couldn't load the outstanding list. Try again." with Retry. Reads retry transient errors (`retryTransient`). |

Unknown database errors map to the generic `SERVICE_UNAVAILABLE` (existing `mapDomainError`), with no stack in production. Reads write no logs.
