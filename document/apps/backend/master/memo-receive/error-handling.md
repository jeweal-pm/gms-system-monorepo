# Error handling: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

Domain errors use the existing `domainCall` and `DocumentErrors` mapping (`src/trade-document/document-errors.ts`), with code prefix `MEMO_RECEIVE`.

| Code | HTTP / tRPC | When | UI |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 BAD_REQUEST | zod or business rule. Field paths include: `lines.N.discount` (over 100% or over gross), `discount` (over subtotal), `lines.N.id` (`unknown_line`), `dueDate`, `exchangeRate`, `photoIds`, `from/to` | The message appears next to the field. The form stays as it is. |
| `MEMO_RECEIVE_NOT_FOUND` | 404 | id missing or deleted | "This Memo Receive no longer exists." The list then reloads. |
| `MEMO_RECEIVE_CHANGED` | 409 CONFLICT | `expectedVersion` stale | Banner "Someone changed this document" with a Reload button. |
| `MEMO_RECEIVE_STATUS_INVALID` | 409 | edit, delete or approve when the document is not PENDING_APPROVAL | "Already approved", then the page reloads read-only. |
| `MEMO_RECEIVE_REFERENCE_INVALID` | 422 | vendor or address is inactive, missing or not that vendor's, or the currency is inactive | Message on the named field. |
| `MEMO_RECEIVE_STOCK_ID_EXHAUSTED` | 409 | more than 9,999 Stock IDs in the year | "Stock ID limit reached for this year. Contact the administrator." Nothing is saved. |
| `PERMISSION_DENIED` / `CSRF_INVALID` | 403 | grant missing, or CSRF token bad | No-access message, or reload the session. |
| `UNAUTHORIZED` | 401 | no session | Go to sign-in. |
| `AUTHORIZATION_UNAVAILABLE` | 503 | auth view or license is not current | "Try again", with no automatic retry. |
| unique violation on `stock_id`, `memo_receive_line_id` or `doc_no` | mapped to `MEMO_RECEIVE_CHANGED` 409 | concurrent approve or save race | as CHANGED |

Every write is one transaction, so a failure leaves no partial document, Stock ID or Memo Stock. The counter rolls back with it. Logs keep the code and ids only.
