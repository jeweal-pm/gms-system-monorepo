# Error handling: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

The envelope and mapping are unchanged (`partnerException`, `documentErrors(...).map`, `mapQuotationError`). Codes are in the [api-contract](api-contract.md#errors).

## Guarded-write miss explanation (D8)

When a guarded `updateMany` changes 0 rows, read `{status, version, deletedAt}` by id and throw the first match:

| Operation | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| delete | row missing → `<CODE>_NOT_FOUND` 404 | `deletedAt` set → `<CODE>_DELETED` 409 | status not deletable → `<CODE>_STATUS_INVALID` 409 | else → `<CODE>_CHANGED` 409 |
| restore | missing → NOT_FOUND | `deletedAt` null → `<CODE>_STATUS_INVALID` 409 | version differs → `<CODE>_CHANGED` 409 | — |
| update (in the transaction, before writing) | missing → NOT_FOUND | `deletedAt` set → DELETED | status → STATUS_INVALID | version → CHANGED |
| approve / submit / reject / cancel | missing → NOT_FOUND | `deletedAt` set → DELETED | status → STATUS_INVALID | else → CHANGED |

## Failure behaviour

- Nothing is partially written: delete and restore are single statements; update and approve roll back their `WRITE_TX` transaction on DELETED.
- Database unavailable → `PARTNER_UNAVAILABLE` 503, logged `<event>.db_unavailable` with `operation: "delete" | "restore"`. There is no automatic server retry (writes are not idempotent across versions). The frontend lets the user retry; a retried delete after success gets CHANGED or DELETED, which the UI treats as "already deleted", then reloads.
- A CHECK violation (P2010 / 23514) on delete can only happen through a code bug (the guard already filters status); it maps to the generic 500 and is logged.

## Frontend mapping (FE-SD-002/003)

| Code | Message | Action |
|---|---|---|
| `<CODE>_DELETED` | "This {noun} was deleted. Restore it to edit." | refetch `get` → read-only view |
| `<CODE>_STATUS_INVALID` on restore | "This {noun} is no longer deleted." | refetch |
| `<CODE>_CHANGED` | existing "changed by someone else" text | refetch |
