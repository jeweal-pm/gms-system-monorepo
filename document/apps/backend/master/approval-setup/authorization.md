# Authorization: approval-setup (SA revision 1, 2026-11-10, approved with ADR-0050)

Existing model: per-user menu/action grants from `auth.current_authorization` (ADR-0016/0020/0031), checked in master per procedure; CSRF double-submit on mutations; license gate unchanged.

| Operation | Check |
|---|---|
| `approvalSetting.list` | signed in + licensed (11 booleans are not sensitive); `waiting` counts only with `approval-setup:VIEW` |
| `approvalSetting.update` | `approval-setup:EDIT` + CSRF |
| `<doc>.create` | `<menu>:ADD` (unchanged) |
| `<doc>.update` | `<menu>:EDIT` (unchanged) + status/isUsed rule |
| `<doc>.delete` / `restore` | `<menu>:DELETE` (unchanged) + status/isUsed rule |
| `<doc>.submit` | `<menu>:ADD` **or** `<menu>:EDIT` + CSRF (Q-AS-25) |
| `<doc>.approve` / `requestRevision` / `reject` | `canApprove(actor, type)` + CSRF |
| `approval.summary` / `pending` | as ADR-0046, `canApprove` replaces the direct `<menu>:APPROVE` check; type must be ON |

## `canApprove(actor, type)`

One helper in `approval-flow.ts`. Today it returns `hasGrant(actor, <menu>, "APPROVE")`. ADR-0050 D3 (owner Q-AS-33, source 04) will replace it with the user's **Approve** multi-select (types), designed later with the user-permission UI revision; existing APPROVE grants become the initial selection. No other code checks APPROVE for these types.

## Catalog change (auth)

New leaf `approval-setup` "Approval" in SETUP after `decimal-setup`, actions `["VIEW", "EDIT"]`. 42 → 43 leaves, 360 → 362 cells (≤ 64 leaves). No grant migration: Super Admin / ALL only until granted. The APPROVE column stays in the matrix for now (removed later with D3).

## Rules that are authorization-relevant

- The maker may approve their own document when `canApprove` (Q-AS-31).
- `<menu>:VIEW` is not required to approve (as ADR-0046: the Approve list shows only what the approver needs); opening the full document from the Approve menu uses `<doc>.get`, which accepts `<menu>:VIEW` **or** `canApprove(actor, type)` for documents in `PENDING_APPROVAL`.
- Actor names are snapshots (ADR-0046 D7 view column); no user directory is exposed.
- The go-live command runs inside the master container with a configured system actor id; it is not reachable over HTTP.
