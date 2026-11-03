# TODO: quotation

- feature-id: `quotation`
- revision: 2 approved (From Stock, 2026-11-03); revision 1 approved and implemented
- status: **approved** 2026-10-26 (SA revision 1 + ADR-0032); implemented 2026-10-26; security review clear; browser check by the owner pending
- source: frontend built under [ADR-0025](../../adr/0025-quotation-frontend.md) (mock data); owner request 2026-10-26 "frontend backend ต่อ api ในหน้า quotation ให้หน่อย ออกเอกสารมาหน่อยเปิดเเก้ไง adr ด้วย"
- backend-bundle: [decisions.md](../../apps/backend/master/quotation/decisions.md), [api-contract.md](../../apps/backend/master/quotation/api-contract.md), [database-diagram.md](../../apps/backend/master/quotation/database-diagram.md), [sequence-diagram.md](../../apps/backend/master/quotation/sequence-diagram.md), [ADR-0032](../../adr/0032-quotation-backend-in-master-service.md)
- dependencies: none new (uses installed `Prisma.Decimal`, `@gms/storage`, tRPC, zod)
- infra: one nginx location for `/api/v1/quotation/photos` (SA-QT-14); no container/volume change
- approved-revision: SA quotation revision 1 + ADR-0032 revision 1
- approved-by: project owner
- approval-evidence: owner 2026-10-26 "อนุมัติ SA quotation rev 1"
- updated-at: 2026-10-28

## Revision 2 (2026-11-03): From Stock — approved

- revision: 2 (UI rev 2 + SA rev 2)
- status: **implemented** 2026-11-03 (approved 2026-11-03; dual security review clear; live browser check pending)
- request: owner 2026-11-03 "เปิด branches ใหม่นำมาจากchange-to-nginx-with-new-skill-agent ไว้สำหรับสร้าง memo outstanding และ และต่อปุ่ม from stock ใน quotation". Answers the same day: "ปุ่ม From Stock แบบเดียวกับ Memo Out คือ มาจาก memostock + stockเราเอง … แค่ดึงรายละเอียดของมาใส่ในใบเสนอราคา ไม่ตัดยอดอะไรทั้งนั้นไม่ approve ด้วย ทำเอกสาร เเละ adr มา"
- branch: `feat/03-11-26-memo-outstanding-quotation-from-stock`
- review-bundle:
  - [ui-spec rev 2](../../apps/frontend/quotation/ui-spec.md), [open questions Q-QTS-01…10](../../apps/frontend/quotation/open-questions.md), [testing](../../apps/frontend/quotation/testing.md)
  - SA revision 2 sections of [decisions](../../apps/backend/master/quotation/decisions.md#sa-revision-2-2026-11-03--from-stock-approved), [API contract](../../apps/backend/master/quotation/api-contract.md), [database diagram](../../apps/backend/master/quotation/database-diagram.md), [sequence diagram](../../apps/backend/master/quotation/sequence-diagram.md)
  - [main flow](../../diagram/quotation-flow.md), [ADR-0038](../../adr/0038-quotation-from-stock.md) (Accepted)
- dependencies: none new
- infra: none (no container, route or volume change)
- approved-revision: UI rev 2 + SA rev 2 (with the Q-QTS-03…10 defaults)
- approved-by: owner
- approved-at: 2026-11-03
- approval-evidence: owner 2026-11-03: "อนุมัติ quotation revision 2 Memo Outstanding ไว้ก่อน"

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-QT-008 | backend | Migration `20261103090000_quotation_from_stock` and Prisma model: four stock columns, FK, index, unique key and stock CHECK on `quotation_line` (SA-QT-15) | `backend-api-master/prisma/**` | approval | migrate deploy (fresh + dev); no drift |
| [x] | BE-QT-009 | backend | Extract the stock-line helper from `customer-stock-document.ts` (Memo Out / Reserve unchanged, SA-QT-20). Quotation schemas: `source` STOCK and `memoStockId`. `QuotationService` stock-line rules, including the unchanged-row rule (SA-QT-16/17/18). Output stock fields. `memoStock.list` gets `quotation:VIEW` (SA-QT-19). | `backend-api-master/src/quotation/**`, `src/trade-document/**`, `src/master/router.ts`, tests | BE-QT-008 | UT-QT-B25/B26, GP-MT-QT2, IT-QT-01…03, existing memo-out / reserve / quotation tests |
| [x] | FE-QT-008 | frontend | Enable From Stock on the Quotation page with the shared `MemoStockModal` ("Add From Stock"). Stock rows: Stock ID, read-only copied fields, Pcs/Weight ≤ picked pending, Sale Price required, no Duplicate. Typed rows and Add row unchanged. Map `source` / `memoStockId` and the saved stock fields. Error messages. Remove the mock `FromStockModal` and `mock/stock.ts`. | `frontend/src/features/quotation/**`, `src/features/trade-document/**` (shared helpers only), tests | BE-QT-009 | UT-QT-09…12 |
| [~] | FE-QT-009 | frontend + parent | Tests, typecheck, lint; live TC-QT-FS-01; sec-auditor + security-auditor on the final code | — | all | all suites pass |

### Evidence, revision 2 (2026-11-03)

- **backend-api-master:** typecheck and lint clean.
  - The full suite ran against a disposable PostgreSQL 18.6 (127.0.0.1:55439, migrated with `prisma migrate deploy`; removed afterwards): 462 passed, 18 skipped.
  - New tests: UT-QT-B25a (schema rules), GP-MT-QT2 (`memoStock.list` with `quotation:VIEW`), and IT-QT-01…03 (`quotation-from-stock.db.integration.test.ts`: nothing held on create, update or delete; CHECK and unique key; an unchanged or lowered row survives a later Memo Out approval, while a raised row is re-checked).
  - The old UT-QT-B10 assertion "STOCK rejected" was updated for revision 2.
  - Memo Out and Reserve now use the shared `stock-lines.ts` helper; their tests are unchanged and pass.
- **Migration `20261103090000_quotation_from_stock`:** applied cleanly on a fresh database and on the dev database.
- **frontend:** typecheck clean (apart from stale generated `.next/types`), lint 0 errors (2 old warnings), 572 tests.
  - New tests: UT-QT-09…12 (`test/quotation/from-stock.test.ts`).
  - Shared changes:
    - `stockLineRules` in `quotation/schema.ts` is now used by Quotation, Memo Out and Reserve.
    - The row-panel Pcs → Weight fill gives exactly the pending weight when all pcs are taken, and is never above it.
    - Quotation Save names the first bad row ("Row N: …").
- **Not done:**
  - Live TC-QT-FS-01: the dev stack had only api-master and postgres running (no nginx, frontend or auth), so it was not run through :8080.
- **Security review** (2026-11-03, same uncommitted revision on base 4bdc9ff): sec-auditor and security-auditor are both clear, with no INV records.
  - Advisory, accepted by design (SA-QT-19, Q-QT-07 / SA-QT-21 deferred): with `quotation:VIEW`, `memoStock.list` also returns the vendor and the vendor's prices (`unitPrice`, `netUnitPrice`, `amount`). The Quotation picker hides them (`showPrice={false}`), but the API does not. Narrowing this is an owner decision for the PRICE work.

## Changes after delivery (owner 2026-10-26)

- Bug (recorded in this feature ledger, fixed the same day): photo upload returned 409 after the first photo — `stored_files_one_ready_source_key` allows one ready row per `(source_type, source_id)` and `source_id` was the uploader. Fix: `source_id` = the photo id (uploader stays in `created_by`). Corrective pass 1, verified by tests.
- SA-QT-04 amended: with no Document Setup row in effect, numbers are plain `1, 2, 3 …` (migration `20261026120000_quotation_plain_numbering`).
- SA-QT-13 amended: no Cancel Quotation button on the Quotation page (API kept).
- Owner 2026-10-27: linked Discount (%)/Discount Amt on lines and the document; units inside boxes; currency code on every money value; editable/rebuilt stone code on lines (SA-QT-07b/08b); Currency page has one Exchange Rate and an optional Description.
- Correction (owner 2026-10-26): Quotation has no approval — Send for Approval button removed; status procedures stay in the API unused.
- Owner 2026-10-27 (SA-QT-03a, supersedes "quotations stay DRAFT"): create saves as `APPROVED` (approvedAt/approvedBy = creator); edit and delete in any non-cancelled status; an older DRAFT/PENDING_APPROVAL/REJECTED row becomes APPROVED on its next save; no status badge on the page for non-cancelled rows (only Rejected/Cancelled). No schema change. Commit 11981aa; frontend 425 + master 384 tests pass; sec-auditor + security-auditor clear (advisory only).
- Owner 2026-10-27 (Figma 140:57207): Tax and Include tax in price on separate lines; the tax rate (%) is keyed on the Tax row inside the breakdown box.
- Owner 2026-10-27: Q-QT-04 answered — tax excludes service charges and labor; Q-QT-05 answered — location, certificate type and labor work stay free text until their masters exist.
- Owner 2026-10-28: the row panel section with Stock ID / Lot / Location is titled **Info** (was "Stone Code").
- INV-20261026-002 resolved 2026-10-27 (owner "แก้ INV-20261026-002"): an oversize line with a 100 % line discount is `VALIDATION_ERROR` at `lines.<i>.unitPrice` (UT-QT-B14c); master 385 tests pass.
- Row panel (owner Figma 2026-10-26): photos uploaded in the row panel (≤ 5, set main there), left photo box view + zoom only; line Discount (%) / Discount Amt (one of them, SA-QT-07a/08a, migration `20261026150000_quotation_line_discount`); Amount only in the table.

## Backend (after SA approval)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-QT-001 | done 2026-10-26; master tests 362 pass | backend | Prisma models + migration `…_quotation` (4 tables, CHECKs, indexes, `(numbering_id, running_no)` unique) | `backend-api-master/prisma/**` | approval | Migration applies on dev; no drift | migrate diff clean |
| [x] | BE-QT-002 | done 2026-10-26; master tests 362 pass | backend | Document numbering: pick row by date, lock it, `max(running_no) + 1` (or start no), `nextNumber` preview; Document Setup `used` + lock used rows (SA-QT-04/05) | `backend-api-master/src/document-setup/**`, `src/document-numbering/**` | BE-QT-001 | Concurrent creates never share a number; deleting the latest reuses its number; used rows refused with `DOCUMENT_SETUP_ROW_IN_USE` | UT-QT-B01…B04 |
| [x] | BE-QT-003 | done 2026-10-26; master tests 362 pass | backend | Quotation schemas (strict zod), totals calculator (Decimal, ADR-0025 D5), service: create/update/get/list/options, snapshots, references | `backend-api-master/src/quotation/**` | BE-QT-002 | Totals match the frontend calculator on the shared fixtures (mockup 131,372.00) | UT-QT-B05…B14 |
| [x] | BE-QT-004 | done 2026-10-26; master tests 362 pass | backend | Status actions submit/approve/reject/cancel/delete with version + status guards (approve/reject for the future Approve page; creator may approve with APPROVE) | same | BE-QT-003 | Every wrong state → `QUOTATION_STATUS_INVALID`; stale → `QUOTATION_CHANGED` | UT-QT-B15…B20 |
| [x] | BE-QT-005 | done 2026-10-26; master tests 362 pass | backend | tRPC `quotation.*` router with `permitted("quotation", …)`; `MasterMenu` + authorization grant mapping | `backend-api-master/src/master/**` | BE-QT-003/004 | Each procedure denies without its action | GP-MT-QT router tests |
| [x] | BE-QT-006 | done 2026-10-26; master tests 362 pass | backend | Photo REST upload/read via `@gms/storage` module `quotation-photo`, `stored_files` metadata | `backend-api-master/src/quotation/**` | BE-QT-001 | Type/magic/size checks; VIEW-only read | UT-QT-B21…B24 |
| [x] | INF-QT-001 | done 2026-10-26 (dev `docker/nginx/gms-dev.conf`; no production profile file in this repo) | infra (parent serializes) | nginx location `/api/v1/quotation/photos` → api-master, 5 MB body (dev + production profiles) | `docker/nginx/**` | approval | Upload works through :8080 | live check |
| [x] | BE-QT-007 | done 2026-10-26: 13/13 live checks on dev Postgres (numbering start/max+1/concurrent/delete-latest reuse, totals, snapshot, status guards, stale version, list, Document Setup lock, CHECK); test data removed; photo bytes not written live (permanent files) | backend | Live integration check through nginx (create → submit → approve; numbering; photo) + handoff | — | BE-QT-005/006, INF-QT-001 | All procedures answer as contracted | live checklist |

## Frontend (after BE-QT-007)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-QT-001 | done 2026-10-26; frontend tests 400 pass; browser not run | frontend | `api.ts`: replace mocks with `masterTrpc.quotation.*`; form ↔ contract mappers; domain-error mapping | `frontend/src/features/quotation/**` | BE-QT-007 | Save/get/delete hit the API; field errors land on fields | UT-QT-01…04 |
| [x] | FE-QT-002 | done 2026-10-26; frontend tests 400 pass; browser not run | frontend | Options from API (customers + addresses, currencies, charge types) and next-number preview; due date starts empty; remove `mock/masters.ts` use | same | FE-QT-001 | Customer change resets addresses (ADR-0025 OQ8) | UT-QT-05 |
| [x] | FE-QT-003 | done 2026-10-26; frontend tests 400 pass; browser not run | frontend | Header actions: Send for Approval by permission + status (Cancel Quotation button removed 2026-10-26); no Approve/Reject on this page | same | FE-QT-001 | Buttons follow SA-QT-02/03/13 | UT-QT-06 |
| [x] | FE-QT-004 | done 2026-10-26; frontend tests 400 pass; browser not run | frontend | Daybook from `quotation.list` (keyset, search) | same | FE-QT-001 | No cancelled; newest first | UT-QT-07 |
| [x] | FE-QT-005 | done 2026-10-26; frontend tests 400 pass; browser not run | frontend | Photos: upload via REST, show by URL; From Stock disabled ("Stock isn't available yet") | same | BE-QT-006 | ≤ 4 photos; errors shown | UT-QT-08 |
| [x] | FE-QT-006 | done 2026-10-26 (UI already locked `used` rows; added the `DOCUMENT_SETUP_ROW_IN_USE` message) | frontend | Document Setup page: used numbering rows shown locked | `frontend/src/features/document-setup/**` | BE-QT-002 | Locked rows can't be edited/removed | UT-DS update |
| [x] | FE-QT-007 | done 2026-10-26: master 364 + frontend 400 tests, tsc, eslint pass; dual security review clear (advisory hardening INV-20261026-001, pending owner selection); amount-overflow note fixed (VALIDATION_ERROR, discount ≤ 14 digits) | frontend + parent | Tests, typecheck, lint; dual security review (sec-auditor + security-auditor) on the final code | — | all | All suites pass | — |

## Decisions needed from the owner

1. Approve **SA quotation revision 1 + ADR-0032** with the 2026-10-26 answers (Q-QT-01/02/03/06/07/08 answered; Q-QT-04/05 answered 2026-10-27, same as the defaults) — done, or name an SA-QT ID to change.
