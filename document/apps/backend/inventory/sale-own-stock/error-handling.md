# Service error handling: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review)
- Envelope: GMS `{ "error": { "code", "message", "requestId", "details?" } }`; codes are stable strings; `message` is English, never a stack trace, SQL, price, cost, Stock ID or search text. Frontend mapping: the Sale `error-handling.md` of ui-spec plus the FE-SO-003 additions. Gateway: none; Nginx passes status and body. Base cases: [inventory/sale error-handling](../sale/error-handling.md) (unchanged); this file lists the **new or changed** cases.

| Scenario | Domain error / status | Public contract (`details`) | User-visible outcome | Retry / idempotency | Logging |
|---|---|---|---|---|---|
| No / bad cookie, license denied | `UNAUTHENTICATED` 401 / `LICENSE_DENIED` 403 | existing | sign-in flow | after sign-in | warn without token |
| No `sale:VIEW` on the picker read | `PERMISSION_DENIED` 403 | `{required: "sale:VIEW"}` | "You don't have access to Sale" (existing) | none | info |
| Auth / license service down | `AUTH_UNAVAILABLE` 503 (fail closed) | existing | banner + Retry | safe (GET) | error |
| Bad picker query (`q` > 100, bad date, `to < from`, range > 366 days, `limit` > 50, bad cursor, unknown key) | `VALIDATION_ERROR` 422 | `[{path, code}]` e.g. `cursor` / `invalid`, `to` / `before_from` | inline filter problem | fix input | debug |
| **Master down while picking** | **not an error**: 200 with own rows and `memoStock: "UNAVAILABLE"` | page flag | notice "Memo Stock is unavailable" + Retry; own rows stay pickable | Retry refetches page 1 | warn `inventory.sale_memo_lots_unavailable {reason ≤ 40}` |
| Own lot has nothing open at Save / Submit (taken, reserved, Memo Out, sold, Load reversed) | `SALE_REFERENCE_INVALID` 422 | `fieldErrors [{path: "lines.N.reference", code: "unavailable"}]` | "Row N: this lot has nothing left" (existing text) | remove the row, pick again | info |
| Lot prefix does not match the source, both ids, duplicate lot | `VALIDATION_ERROR` 422 | `lines.N.reference invalid` / `duplicate` | "Row N: this lot is already on the sale" / "can't be used any more" | fix | debug |
| Qty above the lot's available at Save | `VALIDATION_ERROR` 422 | `lines.N.pcs|weightCt` `exceeds_pending`, `params {availablePcs, availableWeightCt}` | "Row N: More than the available x pcs" (existing) | edit quantity | debug |
| **Short at apply** (another Sale or document took the stones between Save and Approve) | `SALE_SOURCE_SHORT` 409 | `fieldErrors lines.N.pcs|weightCt`, `exceeds_pending` + `params` | Approve toast "Row N: only x pcs / y ct left"; the Sale stays PENDING (approval ON) or is not saved (OFF); edits kept | refresh the picker, lower the quantity, retry | info `inventory.sale_own_short {saleId, lines}` |
| A Load that owns the stock is being edited (`SYNCING`) | `SALE_STOCK_BUSY` 409, `Retry-After: 5` | `{retryAfterSeconds: 5}` | "Stock is being updated, try again in a moment" | retry after 5 s; nothing changed | info |
| A Reserve's hold is still being applied (phase B) | `SALE_RESERVE_BUSY` 409, `Retry-After: 5` (master `SALE_CONSUMPTION_RESERVE_BUSY`) | `{retryAfterSeconds: 5}` | "The reservation is being updated, try again" | retry | info |
| Lot above 500 stocks or an apply above 2,000 | `STOCK_LOT_TOO_LARGE` 422 | `{lotKey?, limit}` | "This lot is too large to pick in one document; contact admin" (existing text) | split the lot / contact admin | warn |
| Master refuses the master lines of a mixed Sale | existing mapping (`SALE_SOURCE_SHORT`, `SALE_REFERENCE_INVALID`, `SALE_IN_USE`) **after the own delta was reversed** | existing | existing | the own stones are back on hand | info `inventory.sale_own_reversed {saleId, revision}` |
| Master unreachable / timeout / op `CONFIRMED` retrying (mixed Sale only) | `SYNC_PENDING` 503, `Retry-After: 5` | `{id, retryAfterSeconds: 5}` | "Saving in progress…" (existing), the Sale shows `syncing` | the same request resumes the same op; sweep re-drives | warn `inventory.sync_pending` |
| Own-only Sale while master is down | **not an error** (fast path) | — | normal success | n/a | none |
| Phase B: Reserve hold or `reserved` bucket below the settlement in tx1 | internal `SALE_OWN_ALLOCATION_DRIFT`; caller sees `SYNC_PENDING` 503 | none public | "Saving in progress…" | op stays `CONFIRMED`; operator `sync:redrive`; if it repeats, an investigation record (corrective ledger) | **error** `inventory.sale_own_drift {saleId, revision, stockCount}` |
| `stock_buckets_check` / balance CHECK violated by a bug | `INTERNAL_ERROR` 500, whole transaction rolled back | generic + `requestId` | banner + request id | safe (nothing changed) | error with stack in logs only |
| Statement timeout in a write (5 s) | `SERVICE_UNAVAILABLE` 503, tx rolled back | existing | banner + Retry | safe | warn |
| Delete / edit of an auto-approved own-stock Sale | allowed (nothing "uses" it yet); `SALE_IN_USE` does not occur for own stock | — | — | — | — |
| Stale `expectedVersion`, deleted, wrong status | `SALE_CHANGED`, `SALE_DELETED`, `SALE_STATUS_INVALID`, `SALE_BUSY` | existing | existing | existing | existing |

## Transaction rollback and compensation

- **tx0** (guarded update + own step + op row) is one transaction: any refusal rolls everything back, nothing is recorded, no op row exists.
- **Compensation** exists only for the window after tx0 commits: `refuseOp` reverses `payload.own.delta` in the same transaction that marks the op refused (same lock order, ledger `SALE_OUT_REVERSAL`). It cannot fail on quantities (the Sale itself holds the `sold` it undoes; no other writer lowers it); an unexpected failure leaves the op for the next re-drive and logs an error.
- **tx1** (completion) is one transaction with the op state change; a failure leaves the op `CONFIRMED` and is retried (idempotent: the own part is not repeated, the Reserve part is recomputed from master's replayed response).
- **Own-only Sales** have no compensation because they have no external call.

## Retry and idempotency summary

| Operation | Key | Replay |
|---|---|---|
| Picker read | none (GET) | safe |
| Save / Approve HTTP write | `expectedVersion` (guarded update) | a second identical call fails `SALE_CHANGED` / `SALE_STATUS_INVALID` before touching stock |
| Mixed Sale op | `(saleId, revision)` + request hash | same revision + same hash resumes; master replays |
| Own delta | atomic with the op row (tx0) | never re-run |
| Refusal reversal | the op state `REFUSED` in the same transaction | once |

Correlation: every response and log line carries `requestId`; the frontend shows it on unexpected errors.
