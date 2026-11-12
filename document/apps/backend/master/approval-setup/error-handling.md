# Error handling: approval-setup (SA revision 1, 2026-11-10, approved with ADR-0050)

Codes and HTTP mapping: [api-contract › Errors](api-contract.md#errors-new-or-widened). Logging: structured `{event, actorId, type, id, docNo, code}`; no reasons/notes in logs beyond length.

| Situation | Server | Client message (English UI) | Client action |
|---|---|---|---|
| Turn OFF with waiting documents | `APPROVAL_SETTING_HAS_WAITING {pending, revision}` | Existing blocked dialog: "{n} {Menu} documents are still waiting for approval or sent back for revision. Finish them in the Approve menu (or have them sent again or deleted) first, then turn approval off." | Switch stays On; Go to Approve |
| Setting changed by someone else | `APPROVAL_SETTING_CHANGED` | "Approval for {Menu} was changed by someone else." | Refetch list |
| Send to approve while OFF (stale page) | `<CODE>_APPROVAL_OFF` | "Approval is now off for {Menu}. Save to approve it." | Refetch setting; buttons switch |
| Save while setting changed (ON→OFF) | succeeds as APPROVED | toast "{docNo} saved and approved (approval is off)." | Show actual status from the response |
| OFF Save fails its effects | today's approve code, e.g. `*_PENDING_SHORT` with field errors | same messages as Approve today, "Nothing was saved." | Form keeps the input |
| Edit / Delete of a used auto-approved document | `<CODE>_IN_USE {usedBy}` | "{docNo} can't be changed: its items are used in {usedBy}." | Page becomes read-only |
| Edit / Delete while Pending / Rejected / reviewed Approved | `<CODE>_STATUS_INVALID` | "{docNo} is waiting for approval and can't be changed." / "… was rejected …" / "… is approved …" | Refetch; read-only |
| Second Revise | `<CODE>_REVISE_LIMIT` | "{docNo} was already sent back once. Approve or reject it." | Revise disabled |
| Revise / Reject without reason | `VALIDATION_ERROR` | "Enter the reason before choosing Revise" / "… Reject" | Inline under the field |
| Approve list for an OFF type | `APPROVAL_TYPE_OFF` | "Approval is off for {Menu}." | Show the off state |
| Stale version | `<CODE>_CHANGED` | "{docNo} was changed by someone else." | Refetch |
| Database / auth unavailable | `PARTNER_UNAVAILABLE` / `AUTHORIZATION_UNAVAILABLE` 503 | "Couldn't save. Try again." | Retry; no state change |

Transactions: every mutation is one transaction; any error rolls back everything (including partial reversal). Lock waits are bounded by the `WRITE_TX` timeout (4 s); a timeout maps to `PARTNER_UNAVAILABLE` (503, "Try again"), a stale version to `<CODE>_CHANGED` (clarification G8). No automatic retries on the server.

Go-live command: per-document errors are recorded and the document soft-deleted (D7); infrastructure errors stop the command with a non-zero exit, leaving already-processed documents committed; rerun continues (idempotent).
