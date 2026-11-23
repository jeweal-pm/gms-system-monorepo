# Service error handling: inventory / stock-card

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Envelope: GMS `{ "error": { "code", "message", "requestId", "details?" } }`; codes are stable strings; `message` is English, never a stack trace, SQL, account name or search text. The frontend mapping is in [frontend error-handling](../../../frontend/stock-card/error-handling.md) (to be aligned by FE-SC-004/006). Gateway: none; Nginx passes status and body.

| Scenario | Domain error / status | Public contract | User-visible outcome | Retry / idempotency | Logging |
|---|---|---|---|---|---|
| No / bad access cookie | `UNAUTHENTICATED` 401 | existing platform | app shell sign-in flow | after sign-in | warn without token |
| Session expired, license denied | `UNAUTHENTICATED` 401 / `LICENSE_DENIED` 403 | existing platform | existing | n/a | info |
| No `stock-card:VIEW` | `PERMISSION_DENIED` 403 | `details: {required: "stock-card:VIEW"}` | "You don't have access to Stock Card" | none | info, user id, route |
| Auth views or license service unavailable | `AUTH_UNAVAILABLE` 503 (fail closed) | existing | banner + Retry | safe (GET) | error |
| Invalid query (bad `sort`, `pageSize`, `page` > 200, dates, `q` > 100, unknown key) | `VALIDATION_ERROR` 422 | `details: [{path, code}]` e.g. `to` / `before_from`, `page` / `too_large` | inline filter problem or banner | fix input | debug count only |
| Malformed or unknown `cardKey` | `STOCK_CARD_NOT_FOUND` 404 | same body for both (no oracle) | "This stock card no longer exists" + link back | none | info, card key prefix |
| Card too large to compute (> 5,000 entries or > 50,000 movements) | `STOCK_CARD_TOO_LARGE` 422 | `details: {entries, limit}` | "Too many transactions; narrow the date range" | narrow `from` / `to` (the cap applies before the date filter on movements, so very old data needs a Closing Stock snapshot, a later feature) | warn: card key, counts |
| Report concurrency guard full (> 2 in flight, 250 ms wait) | `STOCK_CARD_BUSY` 503, `Retry-After: 2` | `details: {retryAfterSeconds: 2}` | "Busy, retrying" then banner | the UI retries once after the delay; GET is safe | info |
| Statement timeout (5 s) | `STOCK_CARD_TIMEOUT` 503 | `details: {limitSeconds: 5}` | "Took too long. Narrow the date range or search" | user narrows; no automatic retry | warn: route, mode, duration |
| Database unavailable / pool exhausted | `SERVICE_UNAVAILABLE` 503 | existing | banner + Retry | safe | error |
| Unexpected exception | `INTERNAL_ERROR` 500 | generic message + `requestId` | banner + request id | safe | error with stack in logs only |
| Internal PUT carries a bad `docDate` / `party` | `VALIDATION_ERROR` 422 | existing internal envelope | master logs; the document save is not blocked by metadata | master fixes the payload | warn |
| Internal PATCH on a document with no hold row | `NOT_FOUND` 404 | existing internal envelope | none (master ignores) | idempotent | debug |
| Internal PATCH / PUT: master down or slow (master side) | master `INVENTORY_UNAVAILABLE` rules unchanged for holds; **PATCH is best effort** | n/a | document saved; card may show the older date or customer | backfill script or the next hold call repairs it | master: warn `master.stock_card_metadata_failed` |
| Backfill script run twice | no error | same state | none | idempotent | info counts |
| Kind in the ledger that the registry does not know (a new module without a registry row) | the row is excluded from the card; the **test fails the build** (BE-SC-008) | n/a | the movement would be missing from the card | fixed in code before release | startup check logs `stock_card.unclassified_kind` at error level and the readiness stays `ok` |

Transaction rollback: the report writes nothing, so there is nothing to roll back. The internal PUT keeps the existing transaction; if the metadata `UPDATE` fails, the whole hold call fails and master follows its saga rules (re-drive).

Correlation: every response and log line carries `requestId`; the frontend shows it on unexpected errors.
