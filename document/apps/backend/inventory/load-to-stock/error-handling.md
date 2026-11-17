# Error handling: inventory / load-to-stock (SA revision 1, pending-review)

Envelope: `{ error: { code, message, requestId, details? } }`. `message` is a fixed English text per code (no SQL, stack, file paths, prices or other users' data). `details` holds only field paths, ids and remaining quantities. The frontend maps codes to the texts in [frontend error-handling](../../../frontend/load-to-stock/error-handling.md) (placeholders there are replaced by these codes).

## Public codes (backend-api-inventory)

| HTTP | Code | When | details | UI recovery |
|---|---|---|---|---|
| 400 | `BAD_REQUEST` | malformed JSON, body > cap, bad multipart | — | generic error |
| 401 | `UNAUTHENTICATED` | no/invalid/expired access JWT, session gone | — | renew token then retry once (shared client) |
| 403 | `PERMISSION_DENIED` | missing grant | — | no-access page / disabled action |
| 403 | `CSRF_INVALID` | mutation without trusted Origin | — | reload |
| 403 | `LICENSE_DENIED` | license not eligible | — | license page |
| 404 | `LOAD_TO_STOCK_NOT_FOUND` | id unknown (after VIEW check) | — | "Load to Stock not found." |
| 404 | `PHOTO_NOT_FOUND` | photo id unknown | — | broken image placeholder |
| 409 | `LOAD_TO_STOCK_CHANGED` | `expectedVersion` stale | `{ currentVersion }` | shared conflict message, edits kept, Refresh |
| 409 | `LOAD_TO_STOCK_STATUS_INVALID` | action not allowed in the current status (e.g. update while PENDING, submit with OFF) | `{ status }` | refetch |
| 409 | `LOAD_TO_STOCK_BUSY` | `sync_state = SYNCING` | `{ retryAfterSeconds: 5 }` | "Saving in progress…", auto-refetch after 5 s |
| 409 | `LOAD_TO_STOCK_IN_USE` | edit/delete of an applied load whose stock is used | `{ stockIds }` (≤ 20) | toast "Some stock from this load is already used; it can't be changed." |
| 409 | `LOAD_TO_STOCK_EXCEEDS_REMAINING` | master refused the allocation | `{ lines: [{ purchaseLineId, rowPaths: string[], remainingPcs, remainingWeightCt }] }` | "Row n: only {p} pcs / {w} ct left on {PU}", refetch picker |
| 409 | `LOAD_TO_STOCK_REVISE_LIMIT` | second Revise | — | Revise disabled |
| 409 | `APPROVAL_SETTING_CHANGED` / `APPROVAL_SETTING_HAS_WAITING` | setting version stale / turn-OFF with waiting docs | `{ pending, revision }` | as master `mapFlowError` |
| 409 | `LOCATION_INACTIVE` | the row's location name is not an active Location Master name (and is not the name already stored on that row) | `{ rowPaths }` | choose another location |
| 413 | `PHOTO_TOO_LARGE` | > 5 MiB | — | ADR-0048 text |
| 415 | `PHOTO_TYPE_INVALID` | not JPEG/PNG by signature | — | ADR-0048 text |
| 422 | `VALIDATION_ERROR` | Zod or business validation | `fieldErrors: [{ path, code, params? }]` | field/row errors, focus first |
| 422 | `LOAD_TO_STOCK_LINE_UNAVAILABLE` | a source PU line is no longer approved/loadable/same vendor | `{ purchaseLineIds, rowPaths }` | remove the row(s) |
| 422 | `LOAD_TO_STOCK_PHOTO_INVALID` | photo id not READY or wrong source | `fieldErrors rows.N.photoIds.M` | re-upload |
| 429 | `RATE_LIMITED` | photo limiter (≤ 3 uploads / copies, ≤ 6 reads per process; an upload is refused before its body is read, INV-20261117-003 F1) | `Retry-After` | retry |
| 503 | `INVENTORY_UNAVAILABLE` (returned by **master**, phase 2) | a master document with own-stock lines cannot reach inventory | `Retry-After: 5` | "Our stock can't be checked right now; try again"; Memo-Stock-only documents unaffected |
| 503 | `MASTER_UNAVAILABLE` | master internal call failed on a **read** path | `Retry-After: 5` | inline error + Retry |
| 503 | `SYNC_PENDING` | master call outcome unknown on a **write** (timeout/5xx); op kept for re-drive | `{ id, retryAfterSeconds: 5 }` | "Saving in progress — refreshing", refetch `get` |
| 503 | `AUTH_UNAVAILABLE` / `DB_UNAVAILABLE` | auth view / own DB down | — | generic retry |
| 500 | `INTERNAL_ERROR` | unexpected (logged with requestId) | — | generic |

`fieldErrors` codes: `required`, `too_small`, `too_big`, `invalid`, `duplicate`, `exceeds_remaining` (`params {remainingPcs, remainingWeightCt}`), `mode_shape` (e.g. NONE row with 2 sources, MERGE with 1), `vendor_mismatch`, `unknown_row`, `merge_qty_locked`.

## Master internal codes (mapped by inventory)

| Master response | Inventory maps to |
|---|---|
| 401/403 (token) | 500 `INTERNAL_ERROR` + alert log `inventory.master_auth_failed` (configuration fault, never shown as user auth) |
| 409 `LOAD_ALLOCATION_EXCEEDS_REMAINING` | 409 `LOAD_TO_STOCK_EXCEEDS_REMAINING` (rows mapped from purchaseLineId) |
| 422 `LOAD_ALLOCATION_LINE_UNAVAILABLE` | 422 `LOAD_TO_STOCK_LINE_UNAVAILABLE` |
| 409 `LOAD_ALLOCATION_STALE` | should not happen (revisions are monotonic); log `inventory.sync_stale`, re-read master `GET load-allocations/{id}` and reconcile: if master's applied revision equals the op's revision, treat as CONFIRMED |
| 422 `VALIDATION_ERROR` | 500 + log (inventory sent an invalid body: bug) |
| timeout / 5xx / connection on PUT | 503 `SYNC_PENDING`; op stays PREPARED |
| timeout / 5xx on reads | 503 `MASTER_UNAVAILABLE` |

## Failure behaviour

- **Atomicity per service:** each local transaction is all-or-nothing. Between them the saga guarantees: master applied ⇔ op reaches CONFIRMED/DONE; a definitive refusal never leaves partial stock; an unknown outcome is never "guessed" — re-drive with the same revision converges because master's PUT is idempotent.
- **Retries:** reads 1 retry with jitter; PUT not retried inline; re-drive backoff `min(2^attempts, 60) s`, `STUCK` after 10 attempts (operator re-drive command, log alert).
- **Master down:** picker/get show errors; Save OFF / Approve return `SYNC_PENDING` only if tx0 committed; otherwise `MASTER_UNAVAILABLE` before any write (the batch read happens first).
- **Inventory DB down:** 503, readiness fails, Compose restarts per policy; no master call is made without a committed op row.
- **Timeout ordering:** master WRITE_TX 4 s < inventory client 5 s, so an inventory timeout means master either committed or rolled back — never a half-applied transaction.
- **Logging:** `warn` for 4xx business codes (code, requestId, id), `error` for 5xx with internal cause; never request bodies, prices, notes, tokens or cookies.

- **Apply re-check (INV-20261117-003 F2):** the apply transaction of an applied edit / delete re-asserts "stock not in use" under the stock row locks. If stock became used after tx0, nothing is reversed or overwritten, the caller gets `409 LOAD_TO_STOCK_IN_USE`, and the op is parked `STUCK` (`last_error = in_use`, load stays `SYNCING`) until the hold is released and `sync:redrive` re-applies the stored revision.
