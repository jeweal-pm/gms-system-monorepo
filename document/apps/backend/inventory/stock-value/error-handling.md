# Service error handling: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Envelope: GMS `{ "error": { "code", "message", "requestId", "details?" } }`; codes are stable strings; `message` is English, never a stack trace, SQL, price, account name or search text. Frontend mapping: the Stock Value `error-handling.md` of ui-spec (aligned by the FE-SV rows). Gateway: none; Nginx passes status and body. The cases are Stock Card's ([error-handling](../stock-card/error-handling.md)) with the codes renamed; only the valuation rows are new.

| Scenario | Domain error / status | Public contract | User-visible outcome | Retry / idempotency | Logging |
|---|---|---|---|---|---|
| No / bad access cookie | `UNAUTHENTICATED` 401 | existing platform | app shell sign-in flow | after sign-in | warn without token |
| Session expired, license denied | `UNAUTHENTICATED` 401 / `LICENSE_DENIED` 403 | existing platform | existing | n/a | info |
| No `stock-value:VIEW` | `PERMISSION_DENIED` 403 | `details: {required: "stock-value:VIEW"}` | "You don't have access to Stock Value" | none | info, user id, route |
| Auth views or license service unavailable | `AUTH_UNAVAILABLE` 503 (fail closed) | existing | banner + Retry | safe (GET) | error |
| Invalid query (bad `sort`, `pageSize`, `page` > 200, dates, `q` > 100, unknown key) | `VALIDATION_ERROR` 422 | `details: [{path, code}]` e.g. `to` / `before_from`, `page` / `too_large` | inline filter problem or banner | fix input | debug count only |
| Malformed or unknown `cardKey` | `STOCK_VALUE_NOT_FOUND` 404 | same body for both (no oracle) | "This stock card no longer exists" + link back | none | info, card key prefix |
| Card too large to compute (> 5,000 entries or > 50,000 movements) | `STOCK_VALUE_TOO_LARGE` 422 | `details: {entries, limit}` | "Too many transactions; narrow the date range" | narrow `from` / `to` | warn: card key, counts |
| Shared report guard full (> 2 in flight across both reports, 250 ms wait) | `STOCK_VALUE_BUSY` 503, `Retry-After: 2` | `details: {retryAfterSeconds: 2}` | "Busy, retrying" then banner | the UI retries once after the delay; GET is safe | info |
| Statement timeout (5 s) | `STOCK_VALUE_TIMEOUT` 503 | `details: {limitSeconds: 5}` | "Took too long. Narrow the date range or search" | user narrows; no automatic retry | warn: route, mode, duration |
| Database unavailable / pool exhausted | `SERVICE_UNAVAILABLE` 503 | existing | banner + Retry | safe | error |
| Unexpected exception | `INTERNAL_ERROR` 500 | generic message + `requestId` | banner + request id | safe | error with stack in logs only |
| **No price for a card** (no Stock ID has a Price list or a usable Last sale) | **not an error**: 200 with `price = null`, `priceSource = NONE`, `amount = null`, `profitLoss = null` | see [api-contract](api-contract.md) | "-" in Price, Amount and Profit/Loss; the Total row notes the unpriced count | n/a | none |
| **No cost for a priced card** | not an error: `profitLoss = null`, counted in `totals.noCostCards` | same | "-" in Profit/Loss | n/a | none |
| Last sale price unusable (needs a unit conversion and the line quantity is 0) | not an error: treated as no Last sale -> `NONE` | same | "-" | n/a | debug count |
| Weight 0 in a `CT` card, pieces > 0 | not an error: `amount = "0.00"` | same | 0.00 | n/a | none |
| Sale or Load edited between the header and transactions calls | not an error: each response is internally consistent (`valuation` on the page) | same | the UI refetches the header on a mismatch | safe | none |
| Partial state (balances load, prices do not) | **does not exist**: one statement; a failure is a normal 5xx; no `pricesUnavailable` flag | n/a | the UI banner for that flag stays unused | n/a | n/a |
| Kind in the ledger unknown to the Stock Card registry | unchanged: excluded; Stock Card's coverage test fails the build | n/a | n/a | n/a | startup log `stock_card.unclassified_kind` |

Transaction rollback: the report writes nothing, so there is nothing to roll back and no saga. No internal master call exists, so no master-down path.

Correlation: every response and log line carries `requestId`; the frontend shows it on unexpected errors.
