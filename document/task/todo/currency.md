# Frontend TODO: currency

- feature-id: `currency`
- revision: 1
- status: **implemented** (frontend + backend; security reviews and manual customer test not run)
- source: owner design 2026-10-26 ([source/01-currency-add.png](../../apps/frontend/currency/source/01-currency-add.png)) + owner text
- ui-spec: [ui-spec.md](../../apps/frontend/currency/ui-spec.md)
- dependencies: none new
- backend-bundles: [SA rev 1](../../apps/backend/master/currency/decisions.md), approved and implemented 2026-10-26
- approved-revision: 1 (UI + SA)
- approved-by: owner
- approved-at: 2026-10-26
- approval-evidence: owner 2026-10-26: "uxui ทำ spec Currency ให้เอาไปใช้ใน company profile และทุก currency และ frontend backend ทำต่อเลย". This one instruction asked for the spec and its implementation, using the defaults Q-CUR-01…09.
- review-bundle: [ui-spec](../../apps/frontend/currency/ui-spec.md), [data-fetching](../../apps/frontend/currency/data-fetching.md), [error-handling](../../apps/frontend/currency/error-handling.md), [testing](../../apps/frontend/currency/testing.md), [open-questions](../../apps/frontend/currency/open-questions.md)

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-CUR-001 | backend | `partner.currency` table + seed migration `20261026090000_currency` | `backend-api-master/prisma/**` | SA-CUR-01 | migration applied in dev (THB, USD seeded) |
| [x] | BE-CUR-002 | backend | `currency.list/get/create/update/delete/options`, base rules, in-use delete check | `backend-api-master/src/currency/**`, `src/master/**`, `app.module.ts`, `common/errors.ts` | SA-CUR-02…04, 06 | UT-CUR-B01…B10, GP-MT-CUR |
| [x] | BE-CUR-003 | backend | Vendor / Customer / Company Profile options and save checks read the currency table; ICU currency list removed | `src/vendor/**`, `src/customer/**`, `src/company-profile/**`, `src/common/{partner-schemas,reference-data}.ts` | SA-CUR-05 | UT-CUR-B11, UT-VEN-CUR1, UT-CUS-CUR1, UT-CP-P41 |
| [x] | BE-CUR-004 | backend | Catalog leaf `currency` (nine actions) under Master Code | `backend-api-auth/src/permission/catalog.ts` | SA-CUR-07 | UT-CAT-01/02 |
| [x] | FE-CUR-001 | frontend | `/setup/currency` page: header, card, rate panel, drawer, delete/discard dialogs, print | `frontend/src/app/setup/currency/**`, `src/features/currency/**` | BE-CUR-002 | UT-CUR-01…04, TC-CUR-01…04 |
| [x] | FE-CUR-002 | frontend | Master Code tile + context panel → `/setup/currency`, `currency` permission | `src/features/home/navigation.ts`, `src/features/setup/setup-destinations.ts` | BE-CUR-004 | UT-NAV-F07, UT-MENU-07 |
| [x] | FE-CUR-003 | frontend | Company Profile / Vendor / Customer currency selects: active + saved inactive | `src/features/partner/**`, `src/features/company-profile/**`, vendor/customer hooks | BE-CUR-003 | UT-CUR-05, TC-CUR-05 |
| [x] | FE-CUR-004 | frontend | Quotation currency from `currency.options`; Exchange Rate = Selling Rate | `src/features/quotation/**` | BE-CUR-002 | UT-CUR-06 |

## Approval and revisions

- Revision 1 (2026-10-26): first spec from the owner design, approved and implemented the same day (see approval evidence).

## Handoffs, evidence, and completion

- Roles: no custom-role launch was used. The ui-spec, SA, backend and frontend skills were applied in this session in sequence (fallback per AGENTS.md).
- Tests:
  - backend-api-master: typecheck, lint, 349 passed.
  - backend-api-auth: typecheck passed, catalog test passed. The full run has 1 flaky failure, GP-AT-02, which passes on its own. The 9 lint errors are in test files this work did not touch.
  - frontend: typecheck, lint (0 errors), 410 passed.
- Live check in dev through nginx :8080:
  - Migration applied: THB and USD seeded with no rates.
  - Created EUR: rates formatted as 38.5000 / 37.2500; drawer row reads "Sell 38.5000 · Buy 37.2500 THB".
  - THB in edit mode: no rate inputs, Active locked, code read-only.
  - USD without rates: "Description is required" and "Rate is required" shown; saved after filling them.
  - Company Profile select lists EUR, THB and USD.
  - Quotation Exchange Rate filled with 33.2500.
  - Test data removed afterwards (EUR deleted, USD reset to its seeded state).
- Not done: sec-auditor / security-auditor reviews; manual customer test.

## Corrective work

None. Default pass limit 3 when work starts ([remediation](../../workflow/remediation.md)).
