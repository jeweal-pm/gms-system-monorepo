# Frontend error handling: approve-center

- UI revision: 1 (approved 2026-11-07)
- API/domain errors: `backend-api-master/src/trade-document/document-errors.ts` (`<CODE>_NOT_FOUND` 404, `_CHANGED` 409, `_STATUS_INVALID` 409, `_DELETED` 409), stock shortage codes (`RESERVE_PENDING_SHORT`, `PURCHASE_PENDING_SHORT`, `MEMO_OUT_PENDING_SHORT`, `MEMO_RETURN_PENDING_SHORT`, `MEMO_OUT_RETURN_OUTSTANDING_SHORT`), `PARTNER_UNAVAILABLE` 503, tRPC `UNAUTHORIZED` / `FORBIDDEN`, CSRF failure.

| User action | Error / condition | Feedback | Recovery | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open a menu | list fails (network / 503) | card shows "Couldn't load {Menu} approvals." + Retry; previous rows kept | Retry | message `role="alert"`; Retry focusable | FE-AP-004 |
| Open a menu | `FORBIDDEN` on list (APPROVE without VIEW) | "You don't have permission to view {Menu} documents." | none | `role="status"` | FE-AP-004 |
| Open any page | count call fails | no badge (silent) | next focus refetch | — | FE-AP-003 |
| Session expired | `UNAUTHORIZED` | existing app-wide sign-in redirect | sign in | existing | — |
| Approve | `_CHANGED` | toast "{docNo} was changed by someone else. The list was refreshed."; row refetched | try again | focus returns to the row's Approve (or the next row if gone) | FE-AP-005 |
| Approve | `_STATUS_INVALID` | toast "{docNo} is no longer pending."; row removed | — | focus moves to the next row's Approve, else the search | FE-AP-005 |
| Approve | `_DELETED` / `_NOT_FOUND` | toast "{docNo} was deleted."; row removed | — | as above | FE-AP-005 |
| Approve | `*_PENDING_SHORT` / `*_OUTSTANDING_SHORT` | inline under the row's actions: "Some stock items no longer have enough pending. Open the document to fix it." with the doc link; error toast | open the document | inline text linked via `aria-describedby` | FE-AP-005 |
| Approve | `FORBIDDEN` (grant removed) | toast "You no longer have permission to approve {Menu}."; counts/permissions refetched | — | — | FE-AP-005 |
| Approve | 503 / network | toast "Couldn't approve {docNo}. Try again." | Retry by clicking again | — | FE-AP-005 |
| Approve selected | some fail | toast "Approved {ok} of {n}"; failed rows stay selected with their inline reason | fix and approve again | progress line `aria-live="polite"` | FE-AP-006 |
| Approve selected | user presses Cancel during progress | stops before the next document; toast "Approved {ok} of {n}. Stopped." | — | focus to the bulk bar | FE-AP-006 |
| Reject… / Revise… | not available | disabled with tooltip "Reject is coming soon" / "Revise is coming soon" | — | `aria-disabled`, tooltip on focus | FE-AP-007 |

Messages never include stack traces, user ids or internal codes. Confirm dialogs restore focus to their trigger on close (existing `confirm-dialog.tsx`). Search text, sort and loaded rows are kept on every error.
