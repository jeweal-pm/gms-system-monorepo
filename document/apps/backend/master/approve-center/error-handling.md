# Error handling: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

The envelope and mapping are unchanged (`partnerException`, `documentErrors(...).map`, router `mapDomainError`). Codes are listed in the [api-contract](api-contract.md#errors). Decision D12.

## Guarded-write miss explanation (reuses `explainMiss`, ADR-0045 D8)

| Operation | Allowed status | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| reject / requestRevision | `PENDING_APPROVAL` | missing → `<CODE>_NOT_FOUND` 404 | `deleted_at` set → `<CODE>_DELETED` 409 | status ≠ PENDING → `<CODE>_STATUS_INVALID` 409 | else → `<CODE>_CHANGED` 409 |
| resubmit | `REVISION_REQUESTED` | same | same | status ≠ REVISION_REQUESTED → STATUS_INVALID | else CHANGED |
| approve | `PENDING_APPROVAL` (unchanged) | same | same | REVISION_REQUESTED / REJECTED / APPROVED → STATUS_INVALID | CHANGED |
| update | `PENDING_APPROVAL`, `REVISION_REQUESTED` | same | same | REJECTED / APPROVED → STATUS_INVALID | CHANGED |
| delete | same as update | same | same | REJECTED / APPROVED → STATUS_INVALID | CHANGED |

## Failure behaviour

- Reject, Revise and Resubmit are single statements: nothing is partially written. Approve keeps its transaction and rollback (stock shortage leaves the document pending).
- Races: approve vs reject vs revise on the same version → exactly one guarded UPDATE wins; the others get CHANGED (version moved) or STATUS_INVALID. Revise vs the creator's update with the same version → one wins; the loser gets CHANGED and reloads.
- Database unavailable → `PARTNER_UNAVAILABLE` 503, logged `<event>.db_unavailable` / `approval.db_unavailable` with `operation`. No server retry (writes are version-guarded and not idempotent). The client lets the user retry; a retried reject after success gets STATUS_INVALID, which the UI treats as "no longer pending".
- `READ_TX` timeout on `approval.pending` (> 2.5 s) → `PARTNER_UNAVAILABLE` 503; logged with `type`, `sort`, `hasQuery` (never the query text). This triggers M-AP-01 index work.
- Auth view without `user_name` (master deployed before auth migration): the reader query fails → `AUTHORIZATION_UNAVAILABLE` 503 for every master call. Prevented by the deployment order D21; covered by a deploy checklist item, not by a runtime fallback.
- `user_name` null / non-string / blank → `displayName = null`; the write stores NULL and the UI shows "—". Never an error.
- A CHECK violation (23514) on review/resubmit can only come from a code bug (the guard filters status); generic 500, logged.

## Frontend mapping (FE-AP-009/010)

| Code | Message | Action |
|---|---|---|
| `VALIDATION_ERROR` `reason` / `note` | "Enter a reason." / "Enter a note." / "Use 500 characters or fewer." | dialog stays open, focus to the field |
| `<CODE>_STATUS_INVALID` on reject/revise/approve | "{docNo} is no longer pending." | close dialog, refetch, row leaves |
| `<CODE>_STATUS_INVALID` on resubmit | "This document was already resubmitted or closed." | refetch the document |
| `<CODE>_CHANGED` | "{docNo} was changed by someone else. The list was refreshed." | refetch; dialog text kept so the user can retry |
| `<CODE>_DELETED` / `_NOT_FOUND` | "{docNo} was deleted." | row leaves |
| `PERMISSION_DENIED` | "You no longer have permission to {action} {Menu}." | refetch summary / permissions |
| `VALIDATION_ERROR` `cursor` | none (silent) | reset paging to the first page |
| 503 | "Couldn't {action} {docNo}. Try again." / list error + Retry; summary failure shows no badge | retry by the user |

Messages never include stack traces, internal ids or SQL. The note is rendered as plain text (React escaping; no HTML/markdown).
