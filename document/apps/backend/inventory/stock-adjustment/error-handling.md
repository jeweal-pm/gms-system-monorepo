# Error handling: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

The envelope is the same as load-to-stock: `{ error: { code, message, details? } }`.

| HTTP | Code | When | details |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod / field rules | `fieldErrors` |
| 403 | `FORBIDDEN` | missing grant | — |
| 404 | `STOCK_ADJUSTMENT_NOT_FOUND` | unknown id / deleted without `deleted=true` | — |
| 409 | `VERSION_CONFLICT` | `expectedVersion` mismatch | `{ currentVersion }` |
| 409 | `STOCK_ADJUSTMENT_STOCK_CHANGED` | on hand ≠ line snapshot at apply/submit | `{ lines: [{ lineId, onHandPcs, onHandWeightCt }] }` |
| 409 | `STOCK_ADJUSTMENT_IN_USE` | reverse needed but a stock's version moved since apply | `{ stockIds }` |
| 409 | `STOCK_ADJUSTMENT_STATUS` | action not allowed in the current status (e.g. edit while PENDING) | `{ status }` |
| 422 | `STOCK_ADJUSTMENT_LINE_UNAVAILABLE` | stock not ACTIVE, not own stock, or not at the document location | `{ lineIds }` |
| 422 | `LOCATION_INVALID` | location not an active Location Master name | — |
| 422 | `NUMBERING_NOT_CONFIGURED` | as load-to-stock | — |
| 502/503 | `MASTER_UNAVAILABLE` | numbering/reference call failed (before any DB write) | — |

All errors roll back the whole transaction, so the stock is never partly adjusted.
