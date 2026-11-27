# Error handling: inventory / merge-split (SA revision 1, pending-review)

Envelope as load-to-stock: `{ error: { code, message, details? } }`. Every error rolls back the whole transaction, so stock is never partly converted.

| HTTP | Code | When | details |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod / mode / conservation rules (SA-MS-03), bad photo ids | `fieldErrors` (≤ 50) |
| 403 | `FORBIDDEN` | missing grant | — |
| 404 | `MERGE_SPLIT_NOT_FOUND` | unknown id / deleted without `deleted=true` | — |
| 409 | `VERSION_CONFLICT` | `expectedVersion` mismatch | `{ currentVersion }` |
| 409 | `MERGE_SPLIT_STATUS` | action not allowed in this status (e.g. edit PENDING or approver-approved) | `{ status }` |
| 409 | `MERGE_SPLIT_STOCK_CHANGED` | source not ACTIVE or on hand ≠ snapshot at submit/apply | `{ sources: [{ sourceId, stockId, availPcs, availWeightCt }] }` |
| 409 | `MERGE_SPLIT_SOURCE_PENDING` | a source is on another PENDING Merge/Split at submit/apply | `{ stockIds, docNos }` |
| 409 | `MERGE_SPLIT_BUSY` | a source's load is SYNCING | `{ retryAfterSeconds: 5 }` + `Retry-After` |
| 409 | `MERGE_SPLIT_IN_USE` | reverse needed but a result moved since apply | `{ stockIds }` |
| 422 | `MERGE_SPLIT_SOURCE_UNAVAILABLE` | stock unknown, REVERSED or not own stock | `{ sourceKeys }` |
| 422 | `MERGE_SPLIT_CURRENCY_MIXED` | MERGE sources with different currency | `{ currencies }` |
| 422 | `MASTER_DATA_INVALID` / `LOCATION_INVALID` | stone code or location not active (master resolve) | `fieldErrors` |
| 422 | `NUMBERING_NOT_CONFIGURED` | as load-to-stock | — |
| 409 | `STOCK_ID_ISSUE_CONFLICT` | master: same key, different count (bug guard) | — |
| 409 | `MEMO_RECEIVE_STOCK_ID_EXHAUSTED` | master counter limit (existing) | — |
| 413 | `PAYLOAD_TOO_LARGE` | JSON > 256 KiB / photo > 5 MiB | — |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | photo not JPEG/PNG by signature | — |
| 502/503 | `MASTER_UNAVAILABLE` | any master call before the transaction | — |

Retry: master calls are idempotent (numbering resolve as today, stock-ids by key), so the client may retry the same request after 5xx/BUSY. The frontend keeps edits on every 409 and shows the per-row message from `details`.
