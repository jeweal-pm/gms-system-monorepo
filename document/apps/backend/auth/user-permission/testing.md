# Backend verification: auth + gateway / user-permission

- Source UI revision / SA revision: 1 / 1 (pending-review)
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
| BT-UP-15 | inactive sign-in, wrong password | inactive user | wrong password | existing 401/423 (no inactive disclosure) | manual runtime | not run |
| BT-UP-16 | gateway context parse | old/new auth response | session-context without/with `authz` | missing `authz` → treated as no grants (fail closed) | code review | not run |
| BT-UP-17 | CRM unchanged | CRM key | `POST /api/v1/users` existing contract | same 201/400/409/422/503 behavior as before | manual runtime | not run |
| BT-UP-18 | photo validation | PNG renamed to JPEG, 600 KB file, GIF | create/update | 400 `PHOTO_INVALID`; > 1 MiB → 413 | manual runtime | not run |
| BT-UP-19 | photo download headers | user with photo | GET photo | correct Content-Type, nosniff, ETag, private cache; regular user → 403 | manual runtime | not run |
| BT-UP-20 | CSV export | user named `=HYPERLINK(...)` | GET export.csv | cell prefixed `'`; BOM; ≤ 600 rows | manual runtime | not run |
| BT-UP-21 | logs | all mutations | inspect auth/gateway logs | no password, photo, phone, email or token values | log review | not run |
| BT-UP-22 | static checks | implemented code | `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r build`, `prisma validate` | pass | static | not run |
| BT-UP-23 | capacity | dev stack | measure session-context p50/p95 before/after; create latency in mock mode | recorded numbers; no guarantee claimed | measurement | not run |
