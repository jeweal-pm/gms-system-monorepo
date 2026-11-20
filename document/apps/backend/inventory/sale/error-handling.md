# Error handling: inventory / sale (SA revision 1, approved 2026-11-18)

Envelope, fixed English messages and platform codes (`BAD_REQUEST`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `CSRF_INVALID`, `LICENSE_DENIED`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `PHOTO_*`, `MASTER_UNAVAILABLE`, `SYNC_PENDING`, `AUTH_UNAVAILABLE`, `DB_UNAVAILABLE`, `INTERNAL_ERROR`, `APPROVAL_SETTING_*`) are as in [load-to-stock error-handling](../load-to-stock/error-handling.md). Frontend texts: [frontend error-handling](../../../frontend/sale/error-handling.md).

## Sale codes (code prefix `SALE`, ADR-0050 `APPROVAL_DOCUMENTS` pattern)

| HTTP | Code | When | details | UI recovery (FE-SL-006/009) |
|---|---|---|---|---|
| 404 | `SALE_NOT_FOUND` | unknown id (after VIEW check) | — | "Sale not found." |
| 409 | `SALE_CHANGED` | stale `expectedVersion` | `{ currentVersion }` | "This sale was changed by someone else…" edits kept |
| 409 | `SALE_DELETED` | action on a soft-deleted Sale (other than restore/get) | — | reload read-only, deleted banner |
| 409 | `SALE_STATUS_INVALID` | action not allowed in the status (e.g. update while PENDING, submit with OFF, approve not pending) | `{ status }` | ADR-0050 shared message, refetch |
| 409 | `SALE_BUSY` | `sync_state = SYNCING` | `{ retryAfterSeconds: 5 }` | "Saving in progress…", refetch after 5 s |
| 409 | `SALE_IN_USE` | edit/delete of an auto-approved Sale whose release would undo a purchased sold quantity | `{ stockIds }` (≤ 20) | "Items of this sale are already purchased from the vendor; it can't be changed." |
| 409 | `SALE_REVISE_LIMIT` | second Revise | — | Revise disabled |
| 409 | `SALE_SOURCE_SHORT` | master refused an apply as short (approve, auto-approved save/edit) | `fieldErrors: [{ path: "lines.N.pcs"|"lines.N.weightCt", code: "exceeds_open"|"exceeds_pending", params: { availablePcs, availableWeightCt } }]` | Approve page: "Some items no longer have enough available. Edit the row and approve again."; Save: row errors |
| 422 | `SALE_REFERENCE_INVALID` | Reserve line not open / Reserve not approved or deleted / other customer or currency / Memo Stock item gone (Save, Submit, or apply → master `LINE_UNAVAILABLE`) | `fieldErrors: [{ path: "lines.N.reference", code: "unavailable" }]` | "This item is no longer available. Remove the row." |
| 422 | `VALIDATION_ERROR` | Zod/business validation incl. `exceeds_open` / `exceeds_pending` at Save (no lock), `customerId`/address `invalid_reference`, `exchangeRate required`, `dueDate before_doc_date`, duplicate reference `duplicate` | `fieldErrors` | field/row errors |
| 422 | `SALE_PHOTO_INVALID` | photo id not READY / not `sale-line` / another user's unlinked upload | `fieldErrors lines.N.photoIds.M` | re-upload |
| 503 | `MASTER_UNAVAILABLE` | master read failed (options, picker, prepare) | `Retry-After: 5` | inline error + Retry; Save refused, edits kept |
| 503 | `SYNC_PENDING` | apply outcome unknown | `{ id, retryAfterSeconds: 5 }` | "Saving in progress — refreshing", refetch |

## Master internal codes mapped by inventory

| Master response | Inventory result |
|---|---|
| `409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE` | tx1′ restore → `409 SALE_SOURCE_SHORT` (line ids mapped to `lines.N`) |
| `422 SALE_CONSUMPTION_LINE_UNAVAILABLE` | tx1′ restore → `422 SALE_REFERENCE_INVALID` |
| `409 SALE_CONSUMPTION_IN_USE` | tx1′ restore → `409 SALE_IN_USE` |
| `409 SALE_CONSUMPTION_STALE` | reconcile with `GET sale-consumptions/{id}`; same revision → treat as applied; else op STUCK, log `inventory.sync_stuck`, caller `503 SYNC_PENDING` |
| `400/401/403` (contract or token bug) | op STUCK, `500 INTERNAL_ERROR`, alert log |
| timeout / 5xx / connection error | op PREPARED with backoff → `503 SYNC_PENDING` |

Master public: `RESERVE_IN_USE` (`reserve.update`/`delete` of an auto-approved Reserve with a sold line; `usedBy` Sale number) uses the existing `<CODE>_IN_USE` mapping.

Failure rules: no partial state is visible — a refused apply leaves both services as before; an unknown outcome is always re-driven with the same revision and payload (idempotent); no HTTP call inside a DB transaction; entered data is kept on every error; messages never include SQL, stack traces, prices, addresses or other users' data.
