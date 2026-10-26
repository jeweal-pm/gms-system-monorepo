# TODO: quotation

- feature-id: `quotation`
- revision: 1
- status: **approved** 2026-10-26 (SA revision 1 + ADR-0032); implemented 2026-10-26; security review clear; browser check by the owner pending
- source: frontend built under [ADR-0025](../../adr/0025-quotation-frontend.md) (mock data); owner request 2026-10-26 "frontend backend ต่อ api ในหน้า quotation ให้หน่อย ออกเอกสารมาหน่อยเปิดเเก้ไง adr ด้วย"
- backend-bundle: [decisions.md](../../apps/backend/master/quotation/decisions.md), [api-contract.md](../../apps/backend/master/quotation/api-contract.md), [database-diagram.md](../../apps/backend/master/quotation/database-diagram.md), [sequence-diagram.md](../../apps/backend/master/quotation/sequence-diagram.md), [ADR-0032](../../adr/0032-quotation-backend-in-master-service.md)
- dependencies: none new (uses installed `Prisma.Decimal`, `@gms/storage`, tRPC, zod)
- infra: one nginx location for `/api/v1/quotation/photos` (SA-QT-14); no container/volume change
- approved-revision: SA quotation revision 1 + ADR-0032 revision 1
- approved-by: project owner
- approval-evidence: owner 2026-10-26 "อนุมัติ SA quotation rev 1"
- updated-at: 2026-10-26

## Changes after delivery (owner 2026-10-26)

- Bug (recorded in this feature ledger, fixed the same day): photo upload returned 409 after the first photo — `stored_files_one_ready_source_key` allows one ready row per `(source_type, source_id)` and `source_id` was the uploader. Fix: `source_id` = the photo id (uploader stays in `created_by`). Corrective pass 1, verified by tests.
- SA-QT-04 amended: with no Document Setup row in effect, numbers are plain `1, 2, 3 …` (migration `20261026120000_quotation_plain_numbering`).
- SA-QT-13 amended: no Cancel Quotation button on the Quotation page (API kept).
- Correction (owner 2026-10-26): Quotation has no approval — Send for Approval button removed; quotations stay DRAFT; status procedures stay in the API unused.
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

1. Approve **SA quotation revision 1 + ADR-0032** with the 2026-10-26 answers (Q-QT-01/02/03/06/07/08 answered; Q-QT-04/05 use the defaults), or name an SA-QT ID to change.
