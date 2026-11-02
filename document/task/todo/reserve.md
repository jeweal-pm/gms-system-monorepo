# TODO: reserve

- feature-id: `reserve`
- revision: 1 (UI rev 1 + SA rev 1)
- status: **implemented** 2026-11-02 (BE-RS-001/002, FE-RS-001/002; FE-RS-003 tests and live check done, security reviews not run).
- request: owner 2026-11-02 "uxui ช่วยเขียน spec Reserve โดยฟังชันก์นี้ จะเป็นการจองของเพื่อนำไปทำหน้า sale frontend backend ทำ ui และ api ให้หน่อย"; answers Q-RS-01…04 the same day.
- source: [source/01-reserve-new.png](../../apps/frontend/reserve/source/01-reserve-new.png), [source/02-add-from-stock.png](../../apps/frontend/reserve/source/02-add-from-stock.png)
- review-bundle:
  - [ui-spec](../../apps/frontend/reserve/ui-spec.md), [open questions](../../apps/frontend/reserve/open-questions.md), [testing](../../apps/frontend/reserve/testing.md)
  - [SA decisions](../../apps/backend/master/reserve/decisions.md), [API contract](../../apps/backend/master/reserve/api-contract.md), [database diagram](../../apps/backend/master/reserve/database-diagram.md), [sequence diagram](../../apps/backend/master/reserve/sequence-diagram.md)
  - [main flow](../../diagram/reserve-flow.md), [ADR-0036](../../adr/0036-reserve-document.md)
- dependencies: none new
- approved-revision: UI rev 1 + SA rev 1 (with the Q-RS-05…08 defaults)
- approved-by: owner
- approved-at: 2026-11-02
- approval-evidence: owner 2026-11-02: "อนุมัติ reserve revision 1"

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-RS-001 | backend | Migration `20261102090000_reserve` + Prisma models; `NumberedDocument` `reserve`; Document Setup `used`; `MasterMenu` `reserve` | `backend-api-master/prisma/**`, `src/document-setup/document-numbering.ts`, `src/master/authorization.ts` | approval | migrate deploy (fresh + dev); UT-RS-B01 |
| [x] | BE-RS-002 | backend | Extract the customer party / stock-line prepare + hook / approve from `memo-out.service.ts` into a shared module (Memo Out unchanged); `ReserveService`; errors `RESERVE_*`; router `reserve.*`; `memoStock.list` + `currency.options` readable with `reserve:VIEW`; wiring | `backend-api-master/src/trade-document/**`, `src/master/**`, `src/common/errors.ts`, `src/app.module.ts`, tests | BE-RS-001 | UT-RS-B02…B04, GP-MT-RS, IT-RS-01…04, existing memo-out tests |
| [x] | FE-RS-001 | frontend | Routes `/pre-sale/reserve` + `[id]`; sidebar link; `features/reserve/api.ts` (schema, mapping, From Stock rows, approve, errors) reusing the Memo Out pieces | `frontend/src/app/pre-sale/reserve/**`, `src/features/reserve/**`, `src/features/home/navigation.ts`, shared memo-out helpers | BE-RS-002 | UT-RS-01…04 |
| [x] | FE-RS-002 | frontend | Reserve page on the shared document form: one From Stock button (shared Memo Stock picker titled "Add From Stock"), stock rows, approval badges / Approve / messages | `frontend/src/features/reserve/**`, `src/features/trade-document/**` | FE-RS-001 | UT-RS-05 |
| [ ] | FE-RS-003 | frontend + parent | Tests, typecheck, lint; live TC-RS-01; sec-auditor + security-auditor on the final code | — | all | all suites pass |

## Evidence (2026-11-02)

- backend-api-master: typecheck and lint clean.
  - The default suite: 417 passed, 48 skipped (DB-gated).
  - With a disposable PostgreSQL 18.6: 447 passed in 3 runs in a row.
  - New tests: UT-RS-B01 (Document Setup `used`), GP-MT-RS (router), IT-RS-01…04 (`reserve.db.integration.test.ts`, including a Memo Out and a Reserve over the same item).
  - Memo Out moved onto the shared `customer-stock-document.ts`; its tests are unchanged and pass.
- `vitest.config.mts`: with `PARTNER_TEST_DATABASE_URL` set, test files run one at a time. Before this, the company-profile logo test (home currency USD) and the memo tests (THB) changed the shared company profile under each other in parallel, which failed random memo DB tests with "exchange rate required". It was latent before Reserve.
- Migration `20261102090000_reserve`: applies cleanly on a fresh database and on the dev database. It was generated from the dev database with `prisma migrate diff`; an unrelated drop of the hand-written `stored_files_one_ready_source_key` index was left out.
- frontend: typecheck clean, lint 0 errors (2 old warnings in login-form), 532 tests (UT-RS-01…05; memo out, quotation and home tests unchanged).
  - Shared code: `trade-document/customer-stock.ts` (schema, mapping, errors) and `customer-stock-config.tsx` (page settings), now used by Memo Out and Reserve.
- Live TC-RS-01 through nginx :8080, superadmin, customer C001:
  1. Sidebar Pre-Sale › Reserve → `/pre-sale/reserve`.
  2. From Stock opened "Add From Stock" with every vendor's items ("from 2 · V001"). Item 260004 added.
  3. Row panel: stone fields locked, "Pending 10 pcs / 100.000 ct". Pcs 1 → Weight 10.00; Sale Price 5000.
  4. Save → Reserve No. 1, Pending Approval; Memo Stock unchanged (10 / 100.000).
  5. Approve (confirm "Its 1 stock item is held for the customer…") → Approved, read-only. Memo Stock 9 / 90.000; Memo Outstanding Reserve 1 / 10.000.
  6. Test data removed afterwards by SQL in the dev database.
- Not done: sec-auditor / security-auditor reviews, manual test.
