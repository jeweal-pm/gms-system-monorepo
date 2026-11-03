# Backend completion handoff: decimal-setup (BE-DEC-001…005)

- From / to: backend (senior-nestjs-developer) → parent / frontend (FE-DEC-101…106)
- Feature / revisions: `decimal-setup`; TODO rev 2 = UI rev 2 + SA rev 1; ADR-0038 (Accepted)
- Approval: owner 2026-11-03 (bundle + Q-DEC-08…18 defaults; Q-DEC-14 changed to "copy grants from Document Setup";
  Q-DEC-09 weight start 2; Q-DEC-11 totals rounded on display only)
- **Owner-directed deviation, Q-DEC-08 (2026-11-03, "ให้ max decimal ที่ 4", then "Choose 0–4, but show only"):**
  - Weight and price places both accept integers 0–4. The SA rev 1 ranges were weight 0–3 and price 0–2.
  - The setting controls display and typing only. Storage scales, trade-document zod (`weightCt` decimal(5,3), money decimal(16,2)) and the 2-dp server totals are unchanged, with no column widening.
  - A frontend input set to 4 places can therefore let a user type a 4th decimal that the server refuses at storage scale. FE-DEC-105 must handle this (for example, cap typing at the storage scale while still displaying N places).
  - Delivered as a new migration, `20261103120000_decimal_setup_places_max_4`. The committed migration `20261103090000_decimal_setup` is unchanged.
- Source revision: commit `d88fbd2` ("fix: decimal ui", made by the user, not by this agent) plus the uncommitted Q-DEC-08 working-tree changes listed below.
- Status: backend done and verified. Dual security review (`sec-auditor` + `security-auditor`) is part of FE-DEC-106 on the combined BE+FE revision (not run yet).

## Contract (unchanged from SA rev 1 [api-contract](../../apps/backend/master/decimal-setup/api-contract.md))

Transport: tRPC, same-origin `/api/master/trpc` (nginx → api-master). Router key `decimalSetup`.

| Procedure | Kind | Input | Output | Authorization | Errors (`error.data.domainCode`, HTTP) |
|---|---|---|---|---|---|
| `decimalSetup.get` | query | none | `{ setup: DecimalSetup }` | signed in + current authorization + license ELIGIBLE; **no grant, no CSRF** | `UNAUTHENTICATED` 401, `AUTHORIZATION_UNAVAILABLE` 503, `LICENSE_REQUIRED` 403, `PARTNER_UNAVAILABLE` 503, `DEPENDENCY_UNAVAILABLE` 503 |
| `decimalSetup.save` | mutation | `{ weightPlaces: int 0..4, pricePlaces: int 0..4, expectedVersion: int ≥ 0 }` (strict, unknown keys refused) | `{ setup: DecimalSetup }` | `decimal-setup:EDIT` (super admin passes) + CSRF (`x-gms-csrf: 1`, same origin) | `VALIDATION_ERROR` 400 with `fieldErrors: [{ path: "weightPlaces" \| "pricePlaces" \| "expectedVersion", code }]`, `DECIMAL_SETUP_CHANGED` 409, `PERMISSION_DENIED` 403, `CSRF_INVALID` 403, plus the `get` errors |

```ts
type DecimalSetup = {
  weightPlaces: number;     // 0..4
  pricePlaces: number;      // 0..4
  version: number;          // ≥ 1; 0 = row missing, defaults 2/2 returned — send expectedVersion 0 to create it
  updatedAt: string;        // ISO 8601 (epoch when version 0)
  updatedBy: string | null; // user id; null = seeded by the migration
};
```

- Each save increases `version` by 1, even when the values did not change. The UI must disable Save when nothing changed.
- Save is never retried automatically. Show the 409 `DECIMAL_SETUP_CHANGED` banner with Reload.
- Live dev value at handoff: `{ weightPlaces: 2, pricePlaces: 2, version: 9 }` (live checks bumped the version), `updatedBy` = super admin id.

## Types for frontend

- Router type: `MasterRouter` from `backend-api-master/src/master/router.ts` (`export type MasterRouter = ReturnType<typeof createMasterRouter>`), the same import the frontend already uses: `import type { MasterRouter } from "@gem-crm/backend-api-master/src/master/router";` then `inferRouterClient<MasterRouter>["decimalSetup"]` (pattern of `frontend/src/features/customer/contract.ts`).
- Input schema / constants (if the frontend wants the same limits): `backend-api-master/src/decimal-setup/decimal-setup.schemas.ts`. It exports `WEIGHT_PLACES_MAX = 4`, `PRICE_PLACES_MAX = 4`, `DECIMAL_SETUP_DEFAULTS = { weightPlaces: 2, pricePlaces: 2 }` and the `DecimalSetup` type.

## Permissions

- The auth catalog now has leaf `decimal-setup` "Decimal Setup" (VIEW, EDIT), directly after Document Setup in SETUP. That makes 42 leaves and `applicableCount` 360. The User and Permission page renders it from `permission.catalog`.
- Grant copy (Q-DEC-14): auth migration `20261103090000_decimal_setup_grants` gave every user with `document-setup` VIEW/EDIT the same `decimal-setup` action (idempotent). In the dev DB it applied at 2026-11-03 07:25 UTC, when no user had Document Setup grants, so it changed nothing. `user@demo.com` received `decimal-setup` VIEW/EDIT later (07:38 UTC) through the User and Permission page.
- Frontend gates (FE-DEC-103): tile/page `decimal-setup:VIEW`; Edit/Save `decimal-setup:EDIT`; the provider calls `get` for every signed-in user.

## Changed files

- `backend-api-master/prisma/schema.prisma` (model `DecimalSetup`), `backend-api-master/prisma/migrations/20261103090000_decimal_setup/migration.sql`
- Q-DEC-08 change (uncommitted): new `backend-api-master/prisma/migrations/20261103120000_decimal_setup_places_max_4/migration.sql`, plus edits to `backend-api-master/src/decimal-setup/decimal-setup.schemas.ts` (max 4/4), the `schema.prisma` comment, and tests (`test/decimal-setup/*`, `test/master/router.test.ts`, `test/master/auth-context.http.integration.test.ts`). Applied in dev at 08:10 UTC.
- `backend-api-master/src/decimal-setup/{decimal-setup.schemas.ts, decimal-setup.errors.ts, decimal-setup.service.ts}`
- `backend-api-master/src/master/authorization.ts` (`MasterMenu` + `decimal-setup`; new `requireMasterSession`; `requireMasterGrant` reuses it, same order)
- `backend-api-master/src/master/router.ts` (`signedIn()`, `decimalSetup.get/save`), `backend-api-master/src/master/trpc-handler.ts` (new last constructor parameter `DecimalSetupService`)
- `backend-api-master/src/app.module.ts`: one parent-authorized registration (import + `DecimalSetupService` provider)
- `backend-api-auth/src/permission/catalog.ts`, `backend-api-auth/prisma/migrations/20261103090000_decimal_setup_grants/migration.sql`
- Tests: see [testing](../../apps/backend/master/decimal-setup/testing.md)

## Verification summary

See [testing.md](../../apps/backend/master/decimal-setup/testing.md) for commands and results. In short: master 40 files / 436 tests pass in the default run, and 47 / 477 pass with the disposable DB. Auth 18 / 97 pass in the default run, and 22 / 106 pass with the disposable DB (this includes the parent's CSRF trusted-origin change). Typecheck and lint are clean for both services. Dev migrations are applied with no `decimal_setup` drift. Live AC-DEC-01…07 all passed through nginx (AC-DEC-06: with price places 0 the server still stored a quotation line at 100.50 / 1.235 ct; the draft was deleted), and the setting was restored to 2/2.

## Rollback

- master: `DROP TABLE "partner"."decimal_setup";` plus revert the code. The frontend falls back to 2/2.
- auth: `DELETE FROM "auth"."UserPermission" WHERE "menu_key" = 'decimal-setup';` (only before anyone edits those grants by hand), plus revert the catalog.

## Open items

- FE-DEC-101…106 (frontend).
- Dual security review on the final BE+FE revision (FE-DEC-106).
- No new packages, containers, variables or Docker changes. No infra or devops handoff is needed beyond the normal image rebuild.
