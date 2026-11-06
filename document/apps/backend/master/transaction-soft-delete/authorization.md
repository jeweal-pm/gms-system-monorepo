# Authorization: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

These are the existing per-user menu/action grants ([ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md)), checked by the master auth context with live authorization ([ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md), [ADR-0031](../../../../adr/0031-private-master-authorization-boundary.md)). There is **no new action or menu**, so `backend-api-auth` and its catalog are unchanged.

| Operation | Grant | CSRF | Notes |
|---|---|---|---|
| `<doc>.list` (either view) | `<menu>` VIEW | no | OQ-5 default: every VIEW user can see the Deleted view |
| `<doc>.get` (deleted document) | `<menu>` VIEW | no | read-only display |
| `<doc>.delete` | `<menu>` DELETE | yes | unchanged grant; behaviour is now soft |
| `<doc>.restore` **new** | `<menu>` DELETE | yes | D7 (OQ-2: could be EDIT) |
| update / approve / submit / reject / cancel | unchanged | yes | refused on deleted documents with `<CODE>_DELETED` |
| Photo download of a deleted document's lines | unchanged (menu VIEW via the existing photo endpoints) | — | D14 |

- The actor id for `deleted_by` / `updated_by` is `ctx.userId` from the grant middleware; it is never taken from input.
- The grant check runs before input validation and any database access (unchanged order). A missing grant gives `PERMISSION_DENIED` before the document is looked up, so it reveals nothing about the document.
- Frontend: Restore is shown only with `access.delete`; the Deleted filter with `access.view`. These are display rules only; the server enforces them.
- Upload: no new upload capability; existing `files/{module}/` scopes and metadata ownership are unchanged.
