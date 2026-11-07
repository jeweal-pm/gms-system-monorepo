# Authorization: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

Existing per-user menu/action grants ([ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md)), checked by the master tRPC context with live authorization ([ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md), [ADR-0031](../../../../adr/0031-private-master-authorization-boundary.md)). **No new menu or action**; the auth permission catalog is unchanged. Decisions D5, D11 in [decisions.md](decisions.md).

| Operation | Grant | CSRF | Notes |
|---|---|---|---|
| `approval.summary` | live session only (`requireMasterSession`) | no | Output filtered to types with `<menu>:APPROVE` **and** `<menu>:VIEW`; Super Admin all. Reveals only counts the caller could list anyway. |
| `approval.pending({type})` | `<menu>:APPROVE` **and** `<menu>:VIEW` | no | New `requireAllMasterGrants`; checked before any query. Approve without View → `PERMISSION_DENIED` (Q-AP-13: the menu is hidden). |
| `<doc>.approve` | `<menu>:APPROVE` | yes | unchanged; the creator may approve (Q-AP-16) |
| `<doc>.reject`, `<doc>.requestRevision` | `<menu>:APPROVE` | yes | new; the creator may reject/revise their own document |
| `<doc>.resubmit` | `<menu>:EDIT` | yes | new; any EDIT user (OQ-AP-3) |
| `<doc>.update` on `REVISION_REQUESTED` | `<menu>:EDIT` | yes | unchanged grant |
| `<doc>.delete` / `restore` | `<menu>:DELETE` | yes | unchanged grant; deletable statuses per D8 |
| `<doc>.get` / `list` (shows review note, submitter name) | `<menu>:VIEW` | no | unchanged |

## Rules

- Order (unchanged, ADR-0031 item 3): mutation CSRF → JWT → auth view → license → procedure grant → input validation → service. A missing grant is reported before the document is read, so it reveals nothing about the document.
- `actorId` and `actorName` come only from the context (`ctx.userId`, `ctx.userName` from the auth view row of the caller's own session). Input never carries a user id or name.
- `approval.*` uses registry identifiers only; `type` is a zod enum, so no input reaches SQL identifiers. All values are bound parameters; `q` is LIKE-escaped.
- **Auth boundary change (D5)**: the master reader can now read `user_name` of the session it is resolving (its own caller). It still cannot read any auth table, other users' names, usernames, emails, phones or photos. The view keeps `security_barrier`. Both security reviewers must review this change with the master code (AGENTS.md).
- Data shown to approvers: the review note and submitter name are business data visible to anyone with the menu's VIEW, like the document content.
- Upload: no upload capability; no `files/{module}/` scope or `@gms/storage` change. Photos on lines keep their existing VIEW-guarded endpoints and permanent retention (ADR-0030).
- Frontend display rules (Reject/Revise buttons only with APPROVE, Resubmit only with EDIT, menu only with APPROVE + VIEW) are convenience; the server enforces every rule.
