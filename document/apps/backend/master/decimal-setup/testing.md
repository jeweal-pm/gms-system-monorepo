# Backend verification: master / decimal-setup

- Source UI revision / SA revision: 2 / 1 (approved 2026-11-03, owner; Q-DEC-14 changed to grant copy)
- Approved API/schema/authorization references: [api-contract](api-contract.md), [database-diagram](database-diagram.md), [authorization](authorization.md)
- Source revision tested: commit `d88fbd2` plus the working tree of 2026-11-03 (the parent's auth CSRF trusted-origin edit in `backend-api-auth/src/trpc/auth-trpc.csrf.ts` was included in the auth runs). Run by backend (senior-nestjs-developer).

## Automated coverage

Follows [automated testing](../../../../workflow/automated-testing.md). The DB integrations are opt-in. They ran against a throwaway `postgres:18.6-alpine` at `127.0.0.1:55440` with tmpfs data, no project volume and 256 MB. All auth and master migrations were applied with `prisma migrate deploy`, and the container was removed afterwards.

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Real boundary / isolated fixture | Result |
|---|---|---|---|---|
| `saveDecimalSetupBodySchema` ranges 0..4 for both (owner Q-DEC-08: 4 accepted, 5 refused), integers, strict, maxima/defaults | UT-DEC-B01 `backend-api-master/test/decimal-setup/decimal-setup.service.test.ts` | IT-DEC-B01 (HTTP 400 + `fieldErrors`) | pure / HTTP adapter | pass |
| `DecimalSetupService.get` (row; missing row → defaults v0 + warn log) | UT-DEC-B02 same | IT-DEC-B02 `backend-api-master/test/decimal-setup/decimal-setup.db.integration.test.ts` | Prisma mocked / real PostgreSQL | pass |
| `save` update OK + log, stale → CHANGED, missing row + v≥1 → CHANGED, v0 create, P2002 → CHANGED, DB down → PARTNER_UNAVAILABLE, other errors pass through | UT-DEC-B03…B06 same | IT-DEC-B02 (stale save; 2 parallel saves → exactly one 409; delete row → v0 → create; second create 409) | Prisma mocked / real PostgreSQL | pass |
| Migrations `20261103090000_decimal_setup` (table, CHECKs, seed row) + `20261103120000_decimal_setup_places_max_4` (ranges 0..4): 23514 on weight 5, price 5, version 0, id 2; 4/4 accepted | — | IT-DEC-B02 | real PostgreSQL | pass |
| Router `decimalSetup.get` (no grant, no CSRF; 401/503/403 order), `save` (`decimal-setup:EDIT` only, `document-setup:EDIT` refused, CSRF, validation after grant, domain codes kept) | UT-DEC-B07 `backend-api-master/test/master/router.test.ts` (GP-MT-DEC) | IT-DEC-B01 `backend-api-master/test/master/auth-context.http.integration.test.ts` (JWT, authz view, license and CSRF through HTTP) | tRPC caller / HTTP adapter with a mocked service | pass |
| `MasterTrpcHandler` passes `DecimalSetupService` to the router | — | IT-DEC-B01 (part) `backend-api-master/test/master/trpc-handler.http.integration.test.ts` (mounted Express handler) | Express + JWKS server | pass |
| `requireMasterSession` order; `requireMasterGrant` unchanged on top of it | UT-DEC-B08 `backend-api-master/test/master/authorization.test.ts` (new) | IT-DEC-B01 | pure | pass |
| Auth catalog: 42 leaves / 360 cells; `decimal-setup` after `document-setup` with VIEW+EDIT only; `parsePermissionKey` | UT-CAT-01…03 `backend-api-auth/test/permission/catalog.test.ts` | IT-DEC-B06 (`loadSessionAuthz` keeps copied cells) | pure | pass |
| Auth migration `20261103090000_decimal_setup_grants` (owner Q-DEC-14): copies document-setup VIEW/EDIT, touches nothing else, idempotent | — | IT-DEC-B06 `backend-api-auth/test/permission/decimal-setup-grants.db.integration.test.ts` (executes the migration SQL twice on 5 fixture users) | real PostgreSQL | pass |

Commands and results (2026-11-03):

| Command | Result |
|---|---|
| `backend-api-master`: `npx vitest run` (default) | 40 files passed / 8 skipped; 436 tests passed / 58 skipped (DB-gated) |
| `backend-api-master`: `PARTNER_TEST_DATABASE_URL=… AUTH_TEST_DATABASE_URL=… npx vitest run` (disposable DB) | 47 files passed / 1 skipped; 477 tests passed / 17 skipped (other live opt-ins) |
| `backend-api-master`: `npx tsc --noEmit`; `npx eslint src "test/**/*.ts"` | exit 0; exit 0 |
| `backend-api-auth`: `npx vitest run` (default, includes parent's CSRF change) | 18 files passed / 5 skipped; 97 tests passed / 15 skipped |
| `backend-api-auth`: `AUTH_TEST_DATABASE_URL=… npx vitest run` | 22 files passed / 1 skipped; 106 tests passed / 6 skipped |
| `backend-api-auth`: `npx tsc --noEmit`; `npx eslint src` | exit 0; exit 0 |
| `backend-api-master`: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (disposable DB) | no `decimal_setup` difference. A pre-existing `stored_files` partial-unique-index line is unrelated |
| Dev DB `prisma migrate status` (master 24, auth 11 migrations) | both "Database schema is up to date"; `partner.decimal_setup` = `1/2/2/v1/null` before the live checks |

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | final BE + FE diff for decimal-setup rev 2 (FE-DEC-106) | pending (after frontend) | — |
| `security-auditor` | same revision | pending (after frontend) | — |

Focus: `get` exposes nothing beyond two integers, a version, a timestamp and the last editor's user id. `save` keeps grant + CSRF. There is no injection surface (integer input only).

## Service acceptance (live, dev stack through nginx `http://localhost:8080`, 2026-11-03)

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| AC-DEC-01 | get, BE-DEC-003 | `pimchanok.r` (role user, zero decimal/document grants) | `decimalSetup.get` | 200 `{setup: {2, 2, version 1}}` | live | **pass**: 200 `{weightPlaces 2, pricePlaces 2, version 1, updatedBy null}` |
| AC-DEC-02 | save, BE-DEC-003 | `pimchanok.r` (no `decimal-setup:EDIT`) | save | 403 `PERMISSION_DENIED` | live | **pass**: 403 `PERMISSION_DENIED`; without `x-gms-csrf` (super admin) 403 `CSRF_INVALID` |
| AC-DEC-03 | save | super admin | save 3/0 at version 1 | 200 version 2; get returns 3/0 | live | **pass**: 200 v2 `updatedBy` = admin id; `pimchanok.r` get → 3/0 v2 |
| AC-DEC-04 | concurrency | super admin and `user@demo.com` (has `decimal-setup:EDIT`) both loaded v3 | both save | second → 409 `DECIMAL_SETUP_CHANGED` | live | **pass**: first 200 v4, second 409 `DECIMAL_SETUP_CHANGED`. A first attempt with two super admin sessions ended the first session (new sign-in for the same user; auth policy), so the case was rerun with two users |
| AC-DEC-05 | ranges (owner Q-DEC-08: 0..4) | super admin | save weight 5 / price 5; save 4/4 | 400 `VALIDATION_ERROR`; 4/4 accepted | live | **pass** (re-run after the 0..4 change, 08:11 UTC): weight 5 and price 5 → 400 `fieldErrors [{path, code: too_big}]`; 4/4 → 200 v8; restored 2/2 v9. (Before the change: weight 4 / price 3 → 400.) |
| AC-DEC-06 | SA-DEC-05 | setting price 0 | create a quotation with unit price 100.50 via API | accepted, stored 100.50 | live | **pass**: with price 0 / weight 2, `quotation.create` 200; `quotation.get` line `unitPrice "100.50"`, `weightCt "1.235"`; the draft was then deleted (200) |
| AC-DEC-07 | cleanup | — | restore 2/2 | row back to 2/2 | live | **pass**: final `{2, 2, version 9}` (the version was bumped by the checks; `updatedBy` = super admin id) |

## Owner change Q-DEC-08 (2026-11-03): weight and price 0..4

- Code: `WEIGHT_PLACES_MAX = PRICE_PLACES_MAX = 4` in `decimal-setup.schemas.ts`. New migration `20261103120000_decimal_setup_places_max_4` drops and re-adds both range CHECKs as `BETWEEN 0 AND 4`. The committed migration `20261103090000_decimal_setup` was not edited, to avoid checksum drift. The seed stays 2/2. Storage scales, trade-document zod and server totals are unchanged.
- Tests updated: UT-DEC-B01 (0..4 accepted, 5 / -1 refused for both), UT-DEC-B07 (4/4 reaches the service, 5 → `VALIDATION_ERROR`), IT-DEC-B01 (HTTP: weight 5 / price 5 → 400 with field errors, 4/4 → 200), IT-DEC-B02 (DB: 5 → 23514 for both, 4/4 accepted).
- Re-run after the change:

| Command | Result |
|---|---|
| master `npx vitest run` | 40 files passed / 8 skipped; 436 passed / 58 skipped |
| master `vitest run` with the throwaway DB (all migrations, including the new one) | 47 files passed / 1 skipped; 477 passed / 17 skipped |
| auth `vitest run` with the throwaway DB | 22 files passed / 1 skipped; 106 passed / 6 skipped |
| master `tsc --noEmit`, `eslint src "test/**/*.ts"` | exit 0, exit 0 |
| `prisma migrate diff` (throwaway DB) | no `decimal_setup` difference (only the older, unrelated `stored_files` line) |
| Dev: `docker restart gms-system-monorepo-api-master-1` (start command runs `migrate deploy`), then `node docker/repair-dev-networks.cjs` | "Applying migration `20261103120000_decimal_setup_places_max_4`"; healthy; dev CHECKs now `weight_places >= 0 AND <= 4`, `price_places >= 0 AND <= 4` |
