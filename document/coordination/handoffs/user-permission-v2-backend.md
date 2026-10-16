# Handoff: user-permission revision 2 backend → parent / frontend

- Feature ID / UI revision: `user-permission` / 2 (`source/rev2-01..04`)
- SA revision / ADR: SA revision 2 ([bundle](../../apps/backend/auth/user-permission/api-contract.md)), [ADR-0020](../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1
- Approval: ADR-0020 rev 1 Accepted 2026-10-15, owner: "frontend backend อนุมัติ ADR-0020" (implement instruction)
- From: backend (senior-nestjs-developer), run 2026-10-15, branch `feat/15-10-26-check-fix-userpermission` (no branch switch; nothing committed or pushed)
- To: parent integration owner → frontend (login page, User and Permission page, matrix v2, AppShell account menu)
- TODO: `BE-UP2-001…011` in [user-permission.md](../../task/todo/user-permission.md#revision-2-adr-0020-backend)
- Dependencies: none new (`username` plugin is inside installed `better-auth` 1.7.7). No manifest, lockfile, Dockerfile, Compose, `.env*` or `.github/**` change; infra/devops not triggered.
- Verification: [testing.md results](../../apps/backend/auth/user-permission/testing.md#results--sa-revision-2-backend-2026-10-15) — 57/57 runtime checks on the live dev stack; typecheck/lint/build-config tsc clean for auth and gateway; frontend `tsc --noEmit` 0 errors against the new `AppRouter`.

## Delivered contract (actual)

**Login** — `POST /api/auth/sign-in/username` `{username, password, rememberMe?}` (better-auth client: `authClient.signIn.username(...)` needs the `usernameClient()` plugin from `better-auth/client/plugins` in the frontend auth client — frontend scope).
- 200: session cookie; body `user` includes `username`.
- 401 `{code:"INVALID_USERNAME_OR_PASSWORD", message, attemptsRemaining}` — also for impossible-format usernames (never 422).
- 423 `{code:"ACCOUNT_LOCKED", message, retryAfterSeconds}`; 403 `{code:"ACCOUNT_INACTIVE", message}`; 429 rate limit (5/min/IP).
- `/sign-in/email` → 404. `attemptsRemaining` / `retryAfterSeconds` fields are unchanged, so the current `login-form.tsx` parsing still works; only the call and label change. The 401 code name changed from `INVALID_EMAIL_OR_PASSWORD` (the frontend never read it).
- Username rule (mirror in the form): trim → lowercase → 3..64 of `^[a-z0-9._@+-]+$`.

**Session** — `session.current.user = {id, username, email, name, role?}`; `email` is the internal `<id>@users.invalid`: **never display it**; show `username` (AppShell avatar menu).

**Catalog** — `permission.catalog` → `{version: 2, actions: [VIEW, ADD, EDIT, DELETE, CANCEL, APPROVE, PRICE, PRINT, EXCEL], nodes, applicableCount: 347}`; node `{key, label, kind: "section"|"group"|"leaf", actions?, children?}`. Top level: leaf `dashboard` (VIEW, APPROVE, PRICE, PRINT, EXCEL) then sections `setup, pre-sale, memo, purchase, inventory, sale-section, account, report`. **Key collision:** section `purchase` and leaf `purchase` share a key — key UI rows by `kind` + key (or path). Sections/groups are not grantable (`setup:VIEW` → `PERMISSION_UNKNOWN`).

**permission.mine** — unchanged shape; v2 keys; Super Admin `"ALL"` (= 9 actions everywhere).

**userAdmin** (all Super Admin only):
- `list` items / `get`: `email` → `username`. `get.readOnly` = Super Admin (meaning now: permissions/active/password/delete locked; personal info editable). `photoVersion` always null.
- `create`: `{username, password, name, phone, locationKeys, active, permissions}` → `{id, updatedAt}`. Errors: `VALIDATION_ERROR` (fieldErrors path `username` for the rule), `USERNAME_TAKEN` 409 `[{path:"username",code:"duplicate"}]`, `PERMISSION_UNKNOWN`, `LOCATION_UNKNOWN`, `PASSWORD_POLICY_VIOLATION`, `USER_LIMIT_REACHED`, `USER_LICENSE_*`.
- `update` (**new**): `{id, expectedUpdatedAt?, username? (echo only), password? ("" = unchanged), name?, phone?, locationKeys?, active?, permissions?}` → `{id, updatedAt}`. Omitted = unchanged; sets replace. Errors: `USER_NOT_FOUND` 404, `USERNAME_IMMUTABLE` 400 `[{path:"username",code:"immutable"}]`, `USER_CHANGED` 409 (only if `expectedUpdatedAt` sent — send `get().updatedAt`), `SUPER_ADMIN_LOCKED` 403, validation codes. Regular user password change revokes the user's sessions and clears the lockout; `active:false` revokes sessions.
- **Super Admin target (incl. self): send only `name`, `phone`, `locationKeys`** (an unchanged `username` and `active: true` are tolerated). Any `permissions` key, non-empty `password` or `active:false` → `SUPER_ADMIN_LOCKED`.
- `delete`: Super Admin or self → `SUPER_ADMIN_LOCKED` (was `SUPER_ADMIN_READ_ONLY`); else `{ok:true}`; repeat → `USER_NOT_FOUND`.

**Dashboard** — `dashboard.shortcutGroups` now lists v2 leaves grouped Main Menu / Setup / Master Code / Pre-Sale / Memo / Purchase / Inventory / Sale / Account / Report (`slug` = menu key; Vendor/Customer keep `href`). Non–Super Admin: `[]` without `dashboard:VIEW`, otherwise items with `<slug>:VIEW`. `/modules/<slug>` pages for new slugs (e.g. `memo-receive`) may not exist in the frontend — frontend-home scope.

**Customer / vendor** — unchanged keys `customer:*`, `vendor:*`; verified the permission gate (the dev stack has no partner container, so data calls answer `PARTNER_UNAVAILABLE`, pre-existing).

**CRM** — `POST /api/v1/users` takes `username`; deprecated `email` alias; both different → 400; duplicate → `USERNAME_TAKEN` (or `EMAIL_ALREADY_EXISTS` when only `email` was sent); 201 `{userId, username, email (= username), createdAt}`.

## Contract deviations (exact)

1. **Photo is not accepted on `userAdmin.update` (nor create)** — the shared contract listed "photo" among Super Admin editable fields. Photo storage/download is still deferred (BE-UP-009/012: needs body-limit changes and a REST route); `photo` fails strict validation with `VALIDATION_ERROR` `[{path:"(root)",code:"unrecognized_keys"}]`. Keep the Photo tile as a placeholder.
2. 401 sign-in code is `INVALID_USERNAME_OR_PASSWORD` (frontend did not depend on the old name; fields unchanged).
3. Additional Better Auth routes disabled beyond `/sign-in/email`: `/update-user`, `/change-email`, `/is-username-available` (unused by the frontend; protect username immutability and avoid an unauthenticated username-existence probe).
4. `expectedUpdatedAt` optional (rev 1 required it).

## Changed files

- Auth: `prisma/schema.prisma`, new `prisma/migrations/20261015120000_username_permission_v2/migration.sql`, `src/auth/{auth.ts,auth.controller.ts,auth.service.ts}`, new `src/auth/username-policy.ts`, `src/permission/catalog.ts`, `src/license/{license.service.ts,license.client.ts}`, `src/user-admin/{user-admin.service.ts,user-admin.controller.ts,user-admin.schemas.ts,user-admin.errors.ts,user-provisioning.service.ts}`, `src/scripts/seed.ts`
- Gateway: `src/main.ts`, `src/trpc/{router.ts,auth-client.ts,user-admin-schemas.ts}`
- Docs: SA bundle `document/apps/backend/auth/user-permission/*` (rev 2), `document/spec/0001-api-contract.md`, `document/spec/0002-login-requirements.md`, `document/diagram/login-flow.md`, `document/testing/login-test-cases.md`, TODO rev-2 section, this handoff, changelog, done report

## Database / environment state

- Dev DB: migration applied by auth start-up after `docker restart f1-system-backend-api-auth-1 f1-system-backend-api-gateway-1` (no volume touched). Users: `pun@gmail.com`, `superadmin@demo.com`, `user@demo.com` (usernames = old emails). `db:seed` re-ran (demo passwords reset to the dev value, demo user `dashboard:VIEW`). All test users deleted; `LoginLockout`/`RateLimit` cleared.
- Deploy order: auth (migration) + gateway + frontend together (ADR-0020). Rollback: see [database-diagram.md](../../apps/backend/auth/user-permission/database-diagram.md#revision-2-adr-0020).

## Open items (not backend scope)

- Frontend: login form → `signIn.username` + label "Username"; account menu shows `username`; user-permission page per contract above (update, lock rules, `USERNAME_*`, `SUPER_ADMIN_LOCKED`, catalog v2 tree).
- Owner/PM: notify CRM (send `username`) and the license-server team (accept non-email subject) before a real license server is connected.
- Corrective ledger: RC-UP2-1, 1 pass used, closed (see TODO "Corrective work").
- Not run: browser checks, manual-tester, `nest build` into the live `dist`, seat-cap race, photo/CSV.
