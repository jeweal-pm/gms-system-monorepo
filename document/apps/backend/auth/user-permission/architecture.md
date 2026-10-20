# Service architecture: auth + gateway / user-permission

- Feature ID / SA revision: `user-permission` / **2** (revision 1: 2026-10-12)
- Source UI revision / TODO: 1 (approved 2026-10-12, UI only) / [central TODO](../../../../task/todo/user-permission.md) (backend rows `BE-UP-*` to be integrated by the parent)
- Status: **implemented** (revision 2, backend 2026-10-15)
- approved-revision: SA 2 via [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 · approved-by: owner (developer_07) · approved-at: 2026-10-15 · approval-evidence: "frontend backend อนุมัติ ADR-0020" (also the implement instruction; ADR §"งานต่อเนื่อง" item 2 assigns this bundle update). Revision 1 approved 2026-10-12 ("frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้").
- ADRs: [ADR-0016 permissions](../../../../adr/0016-per-user-menu-action-permissions.md) (Proposed), [ADR-0017 admin-managed users](../../../../adr/0017-super-admin-managed-users.md) (Proposed); reused unchanged: ADR-0008, ADR-0011, ADR-0012, ADR-0013, ADR-0014, ADR-0015
- Main flow: [user-permission-flow.md](../../../../diagram/user-permission-flow.md)
- Review bundle: this file, [owner decisions](decisions.md), [API contract](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), both ADRs, central TODO
- Frontend sources: [ui-spec](../../../frontend/user-permission/ui-spec.md), [data-fetching](../../../frontend/user-permission/data-fetching.md), [error-handling](../../../frontend/user-permission/error-handling.md), [SA handoff](../../../../coordination/handoffs/user-permission-sa.md)

## Revision 2 changes (ADR-0020; overrides revision 1 text below)

- **Identity:** login is `POST /api/auth/sign-in/username` via the Better Auth `username` plugin
  (bundled in the installed `better-auth` 1.7.7; no new package). `auth.User.username` (varchar 64,
  unique, CHECK `^[a-z0-9._@+-]{3,64}$`) is the identity and the license subject. `auth.User.email` is
  the internal `<id>@users.invalid`. `/sign-in/email`, `/update-user`, `/change-email` and
  `/is-username-available` are disabled. Lockout/rate-limit/LoginAttempt (ADR-0012) hash the
  normalized username with the same HMAC, so buckets of migrated users are unchanged.
- **Catalog v2:** sections/groups/leaves with 9 actions, 39 leaves, 347 applicable cells; all v1
  grants deleted by the migration. Gateway `dashboard.shortcutGroups` follows v2 keys and requires
  `dashboard:VIEW` for non–Super Admins.
- **Update** (`PATCH /internal/v1/user-admin/users/:id`, gateway `userAdmin.update`) is now delivered.
  Super Admin targets are no longer read-only: name, phone and locations are editable; permissions,
  active, password and delete stay locked (`SUPER_ADMIN_LOCKED`).
- **Inactive sign-in** (`ACCOUNT_INACTIVE` 403) is delivered on `/sign-in/username`.
- **CRM** `POST /api/v1/users` takes `username` (deprecated `email` alias).
- Still deferred: photo upload/download and CSV export (no route, `photo` rejected by strict schemas).
- Capacity: ≤ 576 grant rows per user (was 384); session-context is still one PK-prefix query;
  update is one transaction (timeout 4 s) with one Argon2id hash outside it. No new container,
  process, cache or retry.

## Domain and service boundaries

Verified against the checkout on 2026-10-12 (branch `feat/12-10-26-user-permission`):
`backend-api-auth` (NestJS 12 HTTP, Better Auth 1.7.7, Prisma 7.10, schema `auth`) and
`backend-api-gateway` (NestJS HTTP + `@trpc/server` 11.19.0). Gateway builds each tRPC context
from auth `GET /internal/v1/session-context`, forwarding the cookie with a 3.5 s timeout.
Browser traffic uses the Next same-origin proxies `/api/trpc` and `/api/v1`.

**No new service.** Users, credentials, sessions and licenses already belong to auth. User
profile, permission grants, locations and photos are attributes of the same account, so
they belong to the **auth domain and the `auth` PostgreSQL schema**. A separate "user service"
would need cross-service consistency for create/delete with the credential and license.

| Concern | Owner | Interface |
|---|---|---|
| Account create/update/delete, password reset, active flag, seat cap | auth `src/user-admin/**` (new module) | internal HTTP `/internal/v1/user-admin/**`, cookie-authenticated, Super Admin re-checked |
| Shared provisioning (CRM + page) | auth `src/user-admin/user-provisioning.service.ts` | used by `AuthService.createUser` (CRM, contract unchanged) and the admin create path |
| Permission catalog + grants + session authz | auth `src/permission/**` (new) | catalog constant, `UserPermission` table, `authz` block added to `/internal/v1/session-context` |
| Locations (static options) | auth `src/user-admin/location-options.ts` | `GET /internal/v1/user-admin/location-options` |
| Photo bytes | auth `auth.UserPhoto` | set/remove inside create/update; `GET /internal/v1/user-admin/users/:id/photo` |
| Browser contract | gateway `src/trpc/**` | tRPC `permission.*`, `userAdmin.*` |
| Binary/CSV download | gateway `src/app.controller.ts` (or a new `user-admin.controller.ts`) | REST `GET /api/v1/user-admin/users/:id/photo`, `GET /api/v1/user-admin/export.csv` through the existing `/api/v1` proxy |
| Inactive sign-in refusal | auth `src/auth/auth.ts` after-hook | Better Auth `/api/auth/sign-in/username` response `403 ACCOUNT_INACTIVE` (rev 2) |

Gateway never touches the database. Auth enforces authorization for every internal
operation from the session it validates itself, independently of gateway.

## Behavior and operation

**Super Admin** is the existing `User.role = "admin"`. CRM's `role: "SUPER_ADMIN"` request is
already stored as `admin`, and the dev seed uses `admin`. Regular users are `role = "user"`.
This revision adds no new role value and keeps role non-editable.

1. **Page access:** `userAdmin.*` and the export/photo routes require an authenticated
   session, a usable license (existing `licensedProcedure`) and `isSuperAdmin`. Super Admin
   rows are returned read-only: no update, delete or reset through this page.
2. **Create** ([sequence](sequence-diagram.md#2-create-user)): validate the input. If the email
   exists, return `EMAIL_ALREADY_EXISTS`. Then run the **license preflight outside the DB
   transaction**: upstream ≤ 3 s, one jittered retry, reused unchanged. Hash the password
   (Argon2id). In one transaction: `pg_advisory_xact_lock(hashtext('auth.user-seat'))` →
   count `role='user'` → `USER_LIMIT_REACHED` if ≥ limit → insert user + credential account
   + permissions + locations + optional photo. Then cache the preflight token (same
   compensation as CRM: delete the user on cache failure). The unique email constraint
   resolves concurrent duplicates (`P2002` → `EMAIL_ALREADY_EXISTS`).
3. **Update** (optimistic concurrency): the input carries `expectedUpdatedAt`. Update with
   `where id AND updatedAt = expected`; no match → `USER_CHANGED` (409). Replace the
   permission/location sets as whole sets (delete + insert in the same transaction).
   `photo: null` removes, `undefined` leaves unchanged. `password` present → new hash, delete
   all target sessions, reset `LoginLockout` for the email hash and `failed_login_count`.
   `active: false` → delete all target sessions in the same transaction.
4. **Delete:** guard target `role='user'` and target ≠ caller, then delete the user in one
   transaction (FK cascades). Evict the auth in-memory license status entry for that user ID.
5. **Enforcement** ([ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md)):
   session-context also returns `authz: {isSuperAdmin, permissions: string[]}` read with one
   PK-prefix query, **with no cache**, so grant changes and revocations apply on the next
   request. Gateway `permittedProcedure(menuKey, action)` is `licensedProcedure` plus the
   check (Super Admin passes). `dashboard.shortcutGroups` filters items without `VIEW`.
6. **Inactive users:** Better Auth `user.additionalFields.active` (`input: false`) puts
   `active` on the session user. The `/sign-in/email` after-hook deletes the new session and
   returns 403 `ACCOUNT_INACTIVE` when the password was correct but the account is inactive,
   so no enumeration happens before a correct password. Session-context returns 401 for an
   inactive user as defense in depth.
7. **Export:** CSV built in memory from at most the capped list, with formula-injection
   neutralization. Print is client-only.
8. **Logging:** structured events `user_admin.created|updated|deleted|password_reset|deactivated`
   with actor ID, target ID and changed field **names** only. Never log the password, photo
   bytes, phone number or email. Extend Pino redaction for `req.body.password` and
   `req.body.photo` on the auth internal routes. tRPC request bodies are not logged by gateway.
9. **Timeouts:** gateway → auth 3.5 s for reads, 6 s for create (license ≤ 3 s + Argon2 +
   transaction), 5 s for update/delete. A gateway timeout maps to `USER_SERVICE_UNAVAILABLE`
   (503). Gateway does not retry mutations. Create is not idempotent; a retry after a timeout
   can return `EMAIL_ALREADY_EXISTS`, which the UI shows as "user may already exist; refresh".

## Capacity and rollout

- **No container, worker, cache service, volume or replica.** Compose limits stayed at 2.85 vCPU
  / 5.0 GiB of the then 8 GB / 4 vCPU host (now 1.70 vCPU / 2944 MiB of 4 GB / 2 vCPU, ADR-0024). Only one runtime env var is added to auth
  (`USER_SEAT_LIMIT`), through a parent-serialized Compose/`.env.example` edit.
- DB: reuses the existing Prisma `pg` pool (default max 10 per process); no new pool. Each tRPC
  request adds one indexed query for grants (≤ 384 rows: 64 menus × 6 actions cap). The list
  is bounded by `USER_SEAT_LIMIT` (≤ 500) plus admins, with a hard query cap of 600 rows.
  Payloads: list ≈ 200 B/row; get ≤ ~20 KB.
- Memory: an upload is ≤ 700 KB base64 → ≤ 512 KB buffer. Gateway tRPC `maxBodySize` is 1 MiB
  (verify the option name on `@trpc/server` 11.19.0 during implementation). Auth adds a
  route-specific `express.json({limit:"1mb"})` only for `/internal/v1/user-admin/users*`;
  the global 32 KB limit stays. Export ≤ 600 rows × ~2 KB ≈ 1.2 MB string, Super Admin only.
- Disk: photos are at most 512 KB × (seat limit + admins), ≈ 250 MB worst case at limit 500;
  1.5–2 MB at the default of 3. Backed up with PostgreSQL.
- Measurements still needed: session-context latency with the extra query; create latency
  under remote license mode.

**Rollout order:** (1) additive migration → (2) auth (catalog, grants, session-context
`authz`, `active` field, admin module, sign-in hook, CRM refactor onto shared provisioning)
→ (3) gateway (context parse, procedures, REST routes, body limit) → (4) Compose env var →
(5) frontend wiring. An old gateway ignores the new `authz` field. **Rollback:** restore
previous images; the additive tables and columns stay. Note: previous auth images do not check
`active`, so deactivated users could sign in again after a rollback. Record this in the
release note.

## Container infrastructure

Not triggered under the recommended options. No image, network, volume, port or service
changes; photos live in PostgreSQL. Only the auth env var `USER_SEAT_LIMIT` is added, through
the parent; devops records it in the variable contract if deployments template env. **If the
owner picks C-08 B (file-system volume)**, the parent must route infra research before
approval: named volume ownership/UID for the non-root auth user, a read-only root
filesystem exception, backup/restore, a size quota, and cleanup on delete. That option
would create SA revision 2.
