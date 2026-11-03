# TODO: decimal-setup

- feature-id: `decimal-setup`
- revision: 2
- status: **approved** 2026-11-03 — in-progress (backend first, then frontend)
- source: owner text 2026-11-03 (verbatim): "sa uxui Decimal Setup ให้มันไม่ต้องมี Decimal Places by Page ให้มัน set decimal ทั้ง web เลย frontend backend ทำ ui และ api ด้วย"
- ui-spec: [ui-spec.md](../../apps/frontend/decimal-setup/ui-spec.md) (UI revision 2, written by the parent); open questions: [open-questions.md](../../apps/frontend/decimal-setup/open-questions.md) Q-DEC-08…18
- source-ui-revision: 2
- backend-bundles: [master/decimal-setup](../../apps/backend/master/decimal-setup/architecture.md) SA revision 1 ([decisions](../../apps/backend/master/decimal-setup/decisions.md), [api-contract](../../apps/backend/master/decimal-setup/api-contract.md), [authorization](../../apps/backend/master/decimal-setup/authorization.md), [database-diagram](../../apps/backend/master/decimal-setup/database-diagram.md), [sequence-diagram](../../apps/backend/master/decimal-setup/sequence-diagram.md), [error-handling](../../apps/backend/master/decimal-setup/error-handling.md), [dependencies](../../apps/backend/master/decimal-setup/dependencies.md), [testing](../../apps/backend/master/decimal-setup/testing.md)); ADR [0038](../../adr/0038-global-decimal-setup.md) (Proposed); main flow [decimal-setup-flow](../../diagram/decimal-setup-flow.md)
- dependencies: none new (no package, container, variable); integration-owned file `backend-api-master/src/app.module.ts` serialized through the parent
- approved-revision: TODO 2 = UI revision 2 + SA revision 1 (ADR-0038), Q-DEC-14 changed by the owner
- approved-by: project owner (developer_07)
- approved-at: 2026-11-03T11:30+07:00
- approval-evidence: owner 2026-11-03 (AskUserQuestion answers): "Approve, start work (Recommended)" for UI rev 2 + SA rev 1 + ADR-0038 with the Q-DEC-08…18 defaults; Q-DEC-09 weight start "2 places"; Q-DEC-11 "Rounded on display only"; Q-DEC-14 changed to "Copy from Document Setup" (users with document-setup VIEW/EDIT get decimal-setup VIEW/EDIT by a one-time data migration).
- sa-approval: SA revision 1 approved 2026-11-03 (same instruction)
- review-bundle: ui-spec rev 2 + open-questions Q-DEC-08…18 + SA bundle above + ADR-0038 + this TODO revision 2
- updated-at: 2026-11-03T00:00:00+07:00

## Revision history

| Revision | Date | Change | Status |
|---|---|---|---|
| 1 | 2026-10-27 | Per-page weight/price places, frontend mock (localStorage), gated by `document-setup` (FE-DEC-001…004) | approved and implemented 2026-10-27; **superseded** by revision 2 |
| 2 | 2026-11-03 | One global setting (weight 0–3, price 0–2) used by every page; real API + table; own permission leaf, grants copied from Document Setup (BE-DEC-001…005, FE-DEC-101…106) | approved 2026-11-03 |

## Backend (after SA approval) — `backend-api-master`, `backend-api-auth`

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [ ] | BE-DEC-001 | todo | backend | Prisma model `DecimalSetup` + migration `20261103090000_decimal_setup` (table, 4 CHECKs, seed row 2/2) per [database-diagram](../../apps/backend/master/decimal-setup/database-diagram.md) | `backend-api-master/prisma/schema.prisma`, `backend-api-master/prisma/migrations/20261103090000_decimal_setup/**`, `backend-api-master/src/generated/prisma/**` (generated) | SA approval | Applies in dev; seed row present; no drift | IT-DEC-B02 |
| [ ] | BE-DEC-002 | todo | backend | Module `src/decimal-setup/` (schemas with `WEIGHT_PLACES_MAX=3`, `PRICE_PLACES_MAX=2`, defaults; errors `DECIMAL_SETUP_CHANGED`, `mapDecimalSetupError`; service `get`/`save` with optimistic version, v0 create, missing-row defaults, `decimal_setup.updated` log); register in `app.module.ts` (parent-serialized) | `backend-api-master/src/decimal-setup/**`, `backend-api-master/src/app.module.ts` | BE-DEC-001 | Matches [api-contract](../../apps/backend/master/decimal-setup/api-contract.md) and [error-handling](../../apps/backend/master/decimal-setup/error-handling.md) | UT-DEC-B01…B06 |
| [ ] | BE-DEC-003 | todo | backend | Router `decimalSetup.get` (new `signedIn()` → `requireMasterSession`, no grant) and `decimalSetup.save` (`permitted("decimal-setup","EDIT",true)`); `MasterMenu` + `"decimal-setup"`; pass the service through `trpc-handler.ts` | `backend-api-master/src/master/router.ts`, `backend-api-master/src/master/authorization.ts`, `backend-api-master/src/master/trpc-handler.ts`, `backend-api-master/test/master/**` | BE-DEC-002 | [authorization](../../apps/backend/master/decimal-setup/authorization.md) rules; existing router tests updated with the new service mock | UT-DEC-B07, UT-DEC-B08, IT-DEC-B01 |
| [ ] | BE-DEC-004 | todo | backend | Auth catalog leaf `decimal-setup` "Decimal Setup" (VIEW, EDIT) after `document-setup`; header comment 42 leaves / 360 cells. **Owner Q-DEC-14:** one-time auth data migration copying every `document-setup` VIEW/EDIT grant to `decimal-setup` (idempotent, no other grants touched) | `backend-api-auth/src/permission/catalog.ts`, `backend-api-auth/test/permission/catalog.test.ts`, `backend-api-auth/prisma/migrations/<timestamp>_decimal_setup_grants/**` | SA approval | `APPLICABLE_COUNT === 360`; `isGrantInCatalog("decimal-setup","EDIT")`; after migrate, users with document-setup VIEW/EDIT have the same decimal-setup actions; no other leaf changes | UT-CAT-01, IT-DEC-B06 (grant copy) |
| [ ] | BE-DEC-005 | todo | backend | Tests, typecheck, lint for both services; migration applied in dev; live checks AC-DEC-01…07 through nginx (restore 2/2 after) | test paths above | BE-DEC-001…004 | All suites pass; [testing](../../apps/backend/master/decimal-setup/testing.md) results recorded | all above |

## Frontend (after UI rev 2 approval; API items after backend handoff)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-DEC-101 | todo | frontend | Replace the mock: `api.ts` uses `masterTrpc.decimalSetup.get/save`; types `DecimalSetup {weightPlaces, pricePlaces, version, updatedAt, updatedBy}`; choices weight 0–3, price 0–2; remove the per-page list (`DECIMAL_PAGES`, `applyToAll`, `filterPages`…); keep `exampleText`; delete `localStorage` key `gms.decimal-setup.v1` (try/catch), never import it; map `DECIMAL_SETUP_CHANGED` | `frontend/src/features/decimal-setup/**`, `frontend/test/decimal-setup/**` | BE-DEC-003 handoff | No `localStorage` read/write remains; save sends `expectedVersion` | UT-DEC-11 api mapping, UT-DEC-12 storage key removed |
| [ ] | FE-DEC-102 | todo | frontend | Global delivery: `frontend/src/lib/number-format.ts` (exact bigint `formatWeight(value, places)`, `formatMoney(value, places)`, half-up, grouping); `DecimalSetupProvider` + `useNumberFormat()` in `features/decimal-setup/`, mounted inside the signed-in App Shell; React Query staleTime 10 min, retry 1, placeholder defaults 2/2; save → `setQueryData` + invalidate; `quotation/lib/format.ts` delegates to the shared module | `frontend/src/lib/number-format.ts`, `frontend/src/features/decimal-setup/**`, `frontend/src/features/home/app-shell.tsx`, `frontend/src/features/quotation/lib/format.ts`, `frontend/test/decimal-setup/**` | FE-DEC-101 | API error → defaults 2/2, no banner; one `get` per load; all open tabs re-render after save | UT-DEC-13 formatter (0–3 places, negatives, grouping, half-up), UT-DEC-14 provider fallback/invalidation |
| [ ] | FE-DEC-103 | todo | frontend | Decimal Setup page per UI rev 2 (single global card, no "Decimal Places by Page" table, no search); gate tile/page with `decimal-setup` VIEW, Edit/Save with EDIT; add `decimal-setup` to `SETUP_MENU_KEYS`; 409 banner + reload; error state `DetailLoadError` + Retry | `frontend/src/features/decimal-setup/**`, `frontend/src/app/(app)/setup/decimal-setup/page.tsx`, `frontend/src/features/setup/setup-destinations.ts`, `frontend/src/features/home/navigation.ts`, `frontend/test/decimal-setup/**`, `frontend/test/setup/setup-destinations.test.ts` | FE-DEC-101, UI rev 2 approval | Matches ui-spec rev 2; tile hidden without `decimal-setup:VIEW` | UT-DEC-15 page modes, setup-destinations test |
| [ ] | FE-DEC-104 | todo | frontend | Wire display everywhere (Q-DEC-18): every `formatMoney`/`formatWeight`/`formatMoneyText` call and the memo-outstanding-vendor copies (`model.ts` `formatWeight`/`formatMoney`/`formatUnitPrice` → shared module) use `useNumberFormat()` places, including print views and modals; pcs, %, rates untouched | `frontend/src/features/quotation/**`, `frontend/src/features/trade-document/**`, `frontend/src/features/memo-*/**`, `frontend/src/features/reserve/**`, matching `frontend/test/**` | FE-DEC-102 | `grep` finds no hard-coded 2-dp money/weight display left; with 3/0 a quotation shows `1.235 ct` and `48,001` | UT-DEC-16 call-site samples (quotation table, memo stock modal, outstanding report) |
| [ ] | FE-DEC-105 | todo | frontend | Wire inputs: weight fields (`weightCt`, return weight, labor qty with WEIGHT basis) `decimals = weightPlaces`; price fields (unit price, service charges, labor rate, discount AMOUNT) `decimals = pricePlaces`; auto-filled weights round to `weightPlaces`; stored values with more places stay unchanged until edited; calculations stay 2 dp (Q-DEC-11) | `frontend/src/features/quotation/components/**`, `frontend/src/features/trade-document/**`, matching `frontend/test/**` | FE-DEC-102 | Typing a 3rd decimal blocked when weight = 2; existing 1.235 ct loads unchanged | UT-DEC-17 input caps |
| [ ] | FE-DEC-106 | todo | frontend + parent | Tests, typecheck, lint; dual security review (`sec-auditor` + `security-auditor`) on the same BE+FE revision; manual-tester for Decimal Setup and one document page | — | all | All suites pass; reviews recorded | — |

## Decisions needed from the owner

1. Approve **decimal-setup UI revision 2** (parent's ui-spec) and **SA revision 1** (bundle above, ADR-0038) — one instruction may approve both.
2. Accept or change the defaults Q-DEC-08…18 in [open-questions.md](../../apps/frontend/decimal-setup/open-questions.md) (key ones: ranges weight 0–3 / price 0–2, start 2/2, display-and-input only, totals stay 2 dp, read by every signed-in user, new permission leaf → 360 cells).

## Revision 1 items (history, superseded)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-DEC-001 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Route `/setup/decimal-setup`, Setup tile "Decimal Setup" (gated by `document-setup` for now, Q-DEC-05), breadcrumb | `frontend/src/app/setup/decimal-setup/**`, `frontend/src/features/setup/setup-destinations.ts`, `frontend/src/features/home/navigation.ts` | approval | Tile opens the page; hidden without permission | setup-destinations test |
| [x] | FE-DEC-002 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Mock data + `api.ts` (in memory + localStorage, Promise with delay) | `frontend/src/features/decimal-setup/**` | FE-DEC-001 | Save survives a refresh; swap point is `api.ts` only | UT-DEC-01 |
| [x] | FE-DEC-003 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Page: header (Edit/Cancel/Save), Default card + Apply to all, table by section with weight/price selects and live examples, search, view/edit modes, discard dialog, toast | same | FE-DEC-002 | Matches ui-spec F-01…F-08 and states | UT-DEC-02…04 |
| [x] | FE-DEC-004 | done 2026-10-27: frontend 425 tests, tsc, eslint pass; sec-auditor + security-auditor clear (no findings) | frontend + parent | Tests, typecheck, lint; dual security review | — | all | All suites pass | — |

Revision 1 approval: project owner 2026-10-27 "อนุมัติ decimal-setup UI rev 1 ทำเเค่หน้าบ้านเเค่ mock data นะ อย่าพึ่งไปยุ่งกับ db หลังบ้าน" (UI revision 1, defaults Q-DEC-01…07).
