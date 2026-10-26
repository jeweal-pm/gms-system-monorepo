# Backend verification: auth + gateway / user-permission

- Source UI revision / SA revision: 2 / 2 (implemented 2026-10-15, [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md)); revision 1 cases below are historical
- Approved API/schema/authorization references: none yet. Planned against [API](api-contract.md), [database](database-diagram.md), [authorization](authorization.md)

No test runner is installed (tech-stack.md: Vitest/Playwright not added). Discovered scripts:
auth `typecheck` (prisma generate + tsc), `build`, `lint`, `db:migrate`, `db:migrate:dev`, `db:seed`;
gateway `typecheck`, `build`, `lint`. Root `pnpm -r typecheck|lint|build`. Runtime cases below
are run manually against the dev Compose stack (mock license mode) with `curl`/browser when
the backend is implemented. **All cases are not run.**

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| BT-UP-00 | BE-UP-001 schema | clean DB + existing data | `prisma validate`, `db:migrate` | migration applies; existing users `active=true`; CHECKs present | static + migration | not run |
| BT-UP-01 | `permission.mine/catalog` | licensed regular user | query | own grants only; catalog v1 with `applicableCount` | manual runtime | not run |
| BT-UP-02 | Super Admin gate | regular user session | each `userAdmin.*`, photo, export; also direct auth `/internal/v1/user-admin/users` | 403 `SUPER_ADMIN_REQUIRED` at gateway and auth | manual runtime | not run |
| BT-UP-03 | create happy path | Super Admin; mock email `new.user@example.com` (active) | create with permissions/locations/photo | 201 `{id,updatedAt}`; rows in 4 tables; LicenseCache row; response/logs contain no password | manual runtime + log grep | not run |
| BT-UP-04 | create, license pending / none / outage | mock emails `license-pending@…`, `license-expired@…`, `license-revoked@…`, `license-outage@…` (the mock has no `none` scenario; covered by code review) | create | pending → 201; expired/revoked/none → 422 `USER_LICENSE_NOT_ELIGIBLE`; outage → 503 `USER_LICENSE_UNVERIFIABLE`; no user row | manual runtime | not run |
| BT-UP-05 | seat cap + concurrency | `USER_SEAT_LIMIT=1`, 0 regular users | two parallel creates | exactly one 201, one 409 `USER_LIMIT_REACHED`; inactive users still counted | manual runtime | not run |
| BT-UP-06 | duplicate email | existing user | create the same email in different case | 409 `EMAIL_ALREADY_EXISTS` | manual runtime | not run |
| BT-UP-07 | update permissions/locations | saved user | replace sets | stored set equals input; unknown key → 400 | manual runtime | not run |
| BT-UP-08 | stale update | two tabs | second save with old `expectedUpdatedAt` | 409 `USER_CHANGED` | manual runtime | not run |
| BT-UP-09 | password reset | target signed in elsewhere; locked out | update with password | target sessions gone (401 on next request); lockout cleared; new password signs in | manual runtime | not run |
| BT-UP-10 | deactivate | target signed in | update `active:false` | sessions deleted; next request 401; sign-in → 403 `ACCOUNT_INACTIVE` | manual runtime | not run |
| BT-UP-11 | email immutable | saved user | update with `email` | 400 `VALIDATION_ERROR`; nothing changed | manual runtime | not run |
| BT-UP-12 | delete guards + cascade | Super Admin, regular user | delete admin, delete self, delete user | 403, 403, 200; cascaded rows gone; LoginAttempt rows kept with NULL user | manual runtime + SQL | not run |
| BT-UP-13 | grants apply on next request | user with `vendor:VIEW` | revoke, then call shortcuts | Vendor shortcut gone on the next request (no cache) | manual runtime | not run |
| BT-UP-14 | shortcut filtering | user with only `quotation:VIEW` | `dashboard.shortcutGroups` | only Quotation; Super Admin sees all | manual runtime | not run |
| BT-UP3-01 | shortcuts without Dashboard (SA rev 3 D3-01) | user with VIEW on several menus but no `dashboard:VIEW` (e.g. `pun`) | open Home | shortcuts of those menus, no Dashboard item; no VIEW at all → "You don't have access to any menu yet…" | unit (UT-UP-HS-01…03, UT-HOME-03) + manual runtime | unit pass |
| BT-UP-15 | inactive sign-in, wrong password | inactive user | wrong password | existing 401/423 (no inactive disclosure) | manual runtime | not run |
| BT-UP-16 | gateway context parse | old/new auth response | session-context without/with `authz` | missing `authz` → treated as no grants (fail closed) | code review | not run |
| BT-UP-17 | CRM unchanged | CRM key | `POST /api/v1/users` existing contract | same 201/400/409/422/503 behavior as before | manual runtime | not run |
| BT-UP-18 | photo validation | PNG renamed to JPEG, 600 KB file, GIF | create/update | 400 `PHOTO_INVALID`; > 1 MiB → 413 | manual runtime | not run |
| BT-UP-19 | photo download headers | user with photo | GET photo | correct Content-Type, nosniff, ETag, private cache; regular user → 403 | manual runtime | not run |
| BT-UP-20 | CSV export | user named `=HYPERLINK(...)` | GET export.csv | cell prefixed `'`; BOM; ≤ 600 rows | manual runtime | not run |
| BT-UP-21 | logs | all mutations | inspect auth/gateway logs | no password, photo, phone, email or token values | log review | not run |
| BT-UP-22 | static checks | implemented code | `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, `prisma validate` | pass | static | not run |
| BT-UP-23 | capacity | dev stack | measure session-context p50/p95 before/after; create latency in mock mode | recorded numbers; no guarantee claimed | measurement | not run |

## Results — SA revision 2, backend 2026-10-15

Run on branch `feat/15-10-26-check-fix-userpermission` against the live dev stack after
`docker restart f1-system-backend-api-auth-1 f1-system-backend-api-gateway-1` (auth start-up ran
`db:migrate`, applying `20261015120000_username_permission_v2`). Mock license mode. Scripted with a
throw-away Python `urllib` script (not committed) calling auth `:3101` and gateway `:4000/trpc`;
`auth."RateLimit"` rows were cleared between login groups so the 5/min rule did not mask results.
**57/57 checks passed** on the final run.

| Case ID | Check | Result |
|---|---|---|
| BT-UP2-00 | `prisma validate`; `db:migrate` applied; `prisma migrate diff --from-config-datasource --to-schema` → empty; 3 existing users got `username` = old email, `email` = `<id>@users.invalid`; `UserPermission` 0 rows; enum `{VIEW,ADD,EDIT,DELETE,CANCEL,APPROVE,PRICE,PRINT,EXCEL}`; `db:seed` → demo user `dashboard:VIEW` | pass |
| BT-UP2-01 | `sign-in/username` `superadmin@demo.com` → 200, `user.username` present; `"  SuperAdmin@Demo.COM "` → 200; `user@demo.com` → 200 | pass |
| BT-UP2-02 | `POST /api/auth/sign-in/email` → 404 | pass |
| BT-UP2-03 | `session.current.user.username` = `superadmin@demo.com`, `email` ends `@users.invalid`; `permission.mine` SA → `ALL`; `license.status` VALID (license resolved by username) | pass |
| BT-UP2-04 | `permission.catalog`: `version 2`, 9 actions in order, top order dashboard→report with kinds, 6 groups in order, 39 leaves, Σ actions = `applicableCount` = 347, dashboard = VIEW/APPROVE/PRICE/PRINT/EXCEL | pass |
| BT-UP2-05 | `userAdmin.list` items carry `username`, no `email` | pass |
| BT-UP2-06 | create `"a b"` and `"ab"` → `VALIDATION_ERROR` path `username`; create `"User1"` → 200 stored as `user1`; duplicate `user1` → 409 `USERNAME_TAKEN` `[{path:"username",code:"duplicate"}]`; `dashboard:ADD` and `setup:VIEW` → `PERMISSION_UNKNOWN`; `get` returns `username`, sorted grants, `readOnly:false`; DB email = `<id>@users.invalid` | pass |
| BT-UP2-07 | update regular user (name, permissions, `password:""`, echoed username, correct `expectedUpdatedAt`) → 200; grants apply on the user's next request | pass |
| BT-UP2-08 | stale `expectedUpdatedAt` → 409 `USER_CHANGED` | pass |
| BT-UP2-09 | `username:"user9"` on update → 400 `USERNAME_IMMUTABLE` `[{path:"username",code:"immutable"}]` | pass |
| BT-UP2-10 | `active:false` → 200; target's existing session → 401 | pass |
| BT-UP2-11 | sign-in of inactive user with correct password → 403 `{code:"ACCOUNT_INACTIVE"}` and 0 sessions in DB | pass |
| BT-UP2-12 | re-activate + password → old password 401 `INVALID_USERNAME_OR_PASSWORD` `attemptsRemaining:2`, new password 200 | pass |
| BT-UP2-13 | lockout: 3 wrong → 401(2), 401(1), 423 `retryAfterSeconds:60`; correct password while locked → 423 `ACCOUNT_LOCKED`; username `"x"` (impossible format) → 401 `INVALID_USERNAME_OR_PASSWORD` (not 422); admin password reset clears the lockout (sign-in 200) | pass |
| BT-UP2-14 | user1 (`dashboard:VIEW`, `customer:VIEW`, `vendor:VIEW`, `quotation:PRINT`) → `dashboard.shortcutGroups` = `[Main Menu:[dashboard], Master Code:[vendor, customer]]`; `customer.list`/`vendor.list` pass the permission gate (`PARTNER_UNAVAILABLE` 503 because this dev stack has no partner container — pre-existing environment gap, see vendor handoff); `userAdmin.list` → `SUPER_ADMIN_REQUIRED` | pass |
| BT-UP2-15 | Super Admin update name/phone/locations (+ `active:true`, echoed username) → 200; `permissions:[]`, `active:false`, `password` → 403 `SUPER_ADMIN_LOCKED`; delete self/Super Admin → 403 `SUPER_ADMIN_LOCKED`; `get` → `permissions:"ALL"`, `readOnly:true`, phone saved (then restored to null / no location) | pass |
| BT-UP2-16 | CRM `username:"CRM-Test1"` → 201 `username:"crm-test1"`; `email:"crm-test2"` only → 201; both different → 400 `VALIDATION_ERROR`; duplicate via `username` → 409 `USERNAME_TAKEN`, via `email` → 409 `EMAIL_ALREADY_EXISTS`; `username:"license-expired"` → 422 (mock scenario on the whole username); CRM user signs in and `license.status` VALID | pass |
| BT-UP2-17 | delete user1 → 200 `{ok:true}`; again → `USER_NOT_FOUND` | pass |
| BT-UP2-18 | static: auth `typecheck` (prisma generate + tsc) 0, `lint` 0, `tsc -p tsconfig.build.json` to a temp dir 0; gateway `typecheck` 0, `lint` 0, build-config `tsc` 0; frontend `tsc --noEmit` 0 errors against the new `AppRouter` (read-only) | pass |

First run: 54/57. Diagnosed in corrective pass 1 (root cause RC-UP2-1, see the TODO): Better Auth keeps the
endpoint's original status when an after-hook returns `ctx.json(…, {status})`, so `ACCOUNT_INACTIVE` came back as
200 and the impossible-username case as 422 → switched both to a raw `Response`; the third failure was a quoting
bug in the test script's `psql` helper (not product code). Second run 57/57.

Cleanup: test users `user1`, `crm-test1`, `crm-test2` deleted; `LoginLockout` and `RateLimit` rows cleared; the DB
holds the 3 pre-existing accounts (`pun@gmail.com`, `superadmin@demo.com`, `user@demo.com`). The Super Admin's
`name` was rewritten to the same value and its phone/location restored to none.

Not run: `nest build` into the bind-mounted `dist` (would delete the running process's output; a build-config
`tsc` into a temp dir was run instead), parallel seat-cap race, photo/CSV (deferred), browser checks (frontend).
