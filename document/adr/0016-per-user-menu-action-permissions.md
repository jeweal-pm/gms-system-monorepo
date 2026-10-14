# ADR-0016: Per-user menu × action permissions enforced by gateway and auth

- Status: Accepted (SA revision 1, 2026-10-12; evidence: 2026-10-12 owner: 'frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้')
- Date: 2026-10-12
- Feature / source UI revision: `user-permission` / 1 (UI approved 2026-10-12)
- SA revision: 1
- Deciders: Project owner (approval pending)
- Approval evidence: none
- Supersedes / related ADRs: related [ADR-0007 tRPC](0007-trpc-procedure.md), [ADR-0008 Better Auth](0008-use-better-auth.md), [ADR-0013 license](0013-per-user-license-with-signed-token.md), [ADR-0017 admin-managed users](0017-super-admin-managed-users.md)

## Context

The owner (2026-10-12): Super Admin sets, for each user, which menus the user can VIEW, ADD,
EDIT, DELETE, CANCEL and see Price for. Today `auth.User.role` is a single string (`admin` for
Super Admin, `user` otherwise). Gateway checks only the session and license. There is no
permission model (conflict C-07 in the [UI open questions](../apps/frontend/user-permission/open-questions.md)).
SA bundle: [architecture](../apps/backend/auth/user-permission/architecture.md),
[decisions](../apps/backend/auth/user-permission/decisions.md); frontend TODO:
[user-permission](../task/todo/user-permission.md).

## Decision

1. **Catalog in code.** Auth owns a versioned constant catalog (`src/permission/catalog.ts`)
   of menu leaves grouped as in the sidebar. Each leaf lists its applicable actions from
   `VIEW | ADD | EDIT | DELETE | CANCEL | PRICE`. Bounds: ≤ 64 leaves, so ≤ 384 grants per
   user. Version 1 content is in the [API contract](../apps/backend/auth/user-permission/api-contract.md#permission-catalog-v1-proposal)
   and is pending the owner's list (Q-UP-13).
2. **Per-user grants** in `auth.UserPermission(user_id, menu_key, action)`, composite PK,
   cascade on user delete. There are no roles/groups and no implied actions; each action is
   checked independently.
3. **Super Admin** (`role = "admin"`) has implicit ALL permissions and cannot be edited on
   the permission page. This bypass **never** covers license enforcement (ADR-0013 unchanged).
4. **Trusted context.** Auth's internal `session-context` adds `authz:{isSuperAdmin,
   permissions[]}`, read with one PK-prefix query on every request with **no cache**, so
   grant changes and revocations apply on the next request. Gateway treats a missing or
   malformed `authz` as no permissions (fail closed).
5. **Enforcement in gateway:** `superAdminProcedure` and `permittedProcedure(menuKey, action)`
   build on the existing `licensedProcedure`. **Rule for all future features:** every
   menu-scoped procedure declares its `menuKey:action`, and responses include price/cost
   fields only when the caller holds `menuKey:PRICE`. Auth re-checks Super Admin on its own
   internal user-admin endpoints. Existing `dashboard.shortcutGroups` is filtered by VIEW.
   Frontend exposes `permission.mine` to hide navigation; that is UX only.

## Alternatives

| Option | Why not chosen |
|---|---|
| Store grants only, enforce later | Owner wants permissions to control what users can do; unenforced grants are misleading and insecure |
| Role/group RBAC (roles table, role→permission, user→role) | More schema and UI than requested; the approved UI assigns permissions per user. Can be layered later (a role becomes a template copied into user grants, like Duplicate) |
| Catalog in a DB table managed at runtime | Menus are defined by code/features; a table needs seeding/migrations for every menu change and admin UI that is not requested |
| Cache grants in auth memory (like the 15 s license cache) | Saves one indexed query but delays revocation; cost is negligible at this scale |
| Separate authorization service / policy engine (OPA, Casbin) | New container or dependency on an 8 GB / 4 vCPU host for a 6-action matrix; not justified |
| Better Auth `admin`/`access` plugins | Role-centric and changes Better Auth schema and endpoints; the per-user matrix maps poorly; adds surface area |

## Consequences and capacity

- One additional indexed query per tRPC request (≤ 384 rows, typically far fewer) on the
  existing pool. No new container, cache, worker or package. Compose stays at 2.85 vCPU / 5.0 GiB.
- Existing `role="user"` accounts get no grants after migration (least privilege; the dev seed
  grants the demo user VIEW). Super Admins keep full access.
- Future feature procedures must adopt `permittedProcedure`. Reviews should reject
  menu-scoped procedures without it.
- Catalog changes are code changes; stale grants for removed cells are ignored and pruned on
  the next save. No migration is needed.
- Rollback: previous gateway ignores `authz`, so access becomes license-only again.

## Acceptance and approval

Checks: BT-UP-01, 02, 13, 14, 16 in the [verification plan](../apps/backend/auth/user-permission/testing.md).
Approval covers this ADR revision 1 together with SA bundle `user-permission` revision 1
(all documents in `document/apps/backend/auth/user-permission/`), ADR-0017 and the backend
rows `BE-UP-*`. No new package. Keep Proposed until the owner approves this exact revision.
