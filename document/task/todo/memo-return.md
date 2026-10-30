# Frontend TODO: memo-return

- feature-id: `memo-return`
- revision: 1
- status: **implemented** 2026-10-29 (FE-MRT-001…003). Memo Receive page on the API, Stock IDs and stock posting are later (FE-MRT-004/005).
- source: owner design 2026-10-29 ([source/](../../apps/frontend/memo-return/source/))
- ui-spec: [ui-spec.md](../../apps/frontend/memo-return/ui-spec.md); answers: [open-questions.md](../../apps/frontend/memo-return/open-questions.md); tests: [testing.md](../../apps/frontend/memo-return/testing.md)
- dependencies: none new
- backend-bundles: [SA rev 1](../../apps/backend/master/memo-return/decisions.md) + [API contract](../../apps/backend/master/memo-return/api-contract.md), on [ADR-0033](../../adr/0033-memo-documents-in-master-service.md); implemented 2026-10-29
- approved-revision: 1 (UI) + SA rev 1
- approved-by: owner
- approved-at: 2026-10-29
- approval-evidence: owner 2026-10-29: "uxui ช่วยเขียน spec memo return ให้หน่อยและ frontend backend ช่วยเขียน UI และ api ให้หน่อย Memo Return No.: ดึงค่ามาจาก Document set up ด้วย"; Memo Stock source answer: "Memo Receive (Recommended)" (build the Memo Receive API first, backend only).
- review-bundle: ui-spec, open-questions, testing, SA decisions, API contract

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | FE-MRT-001 | backend | Memo Receive + Memo Return API (SA-MR-01…07): tables + migration, `memoReceive.*`, `memoReturn.*` incl. `memoStock`, Document Setup keys `memo-receive` / `memo-return`, engine hooks `prepare` / `writeGuard` / `sourceLine`, shared `vendorParty` | `backend-api-master/src/trade-document/**`, `src/master/**`, `src/document-setup/document-numbering.ts`, `src/common/errors.ts`, `prisma/**`, `src/app.module.ts` | owner 2026-10-29 | UT-MR-B01…B06, GP-MT-MR |
| [x] | FE-MRT-002 | frontend | Page `/memo/memo-return` + `/[id]`: shared vendor header, Memo Stock picker (Add Memo Stock), return table (checkbox, remove, Add row, Return-only inputs, Pcs → Weight), view mode with Memo Return Details, daybook, sidebar link | `frontend/src/features/memo-return/**`, `src/features/trade-document/**`, `src/features/memo-out-return/**`, `src/app/memo/memo-return/**`, `src/features/home/navigation.ts` | FE-MRT-001 | UT-MRT-01…07, TC-MRT-01 |
| [x] | FE-MRT-003 | frontend | Shared pieces: `returnItemTable` (memo out return keeps its rev 3 table), `VendorDocumentInfoForm` / `VendorDocumentDetails`, `DocumentForm` `picker` / `viewHeader` | `src/features/trade-document/**` | — | memo-out-return tests (UT-MOR-*) still pass |
| [ ] | FE-MRT-004 | frontend + backend | Memo Receive page on the API (replace the mock store): status flow, running Stock IDs, photos (Q-MRT-05, SA-MR-08) | `src/features/memo-receive/**`, memo receive API | owner decisions | — |
| [ ] | FE-MRT-005 | inventory | Stock effect of receive / return | inventory service (ADR-0027) | inventory approval | — |

## Handoffs, evidence, and completion

- FE-MRT-001…003 evidence:
  - backend-api-master: typecheck and lint clean, 402 tests.
  - frontend: typecheck and lint clean, 458 tests.
  - live through nginx :8080: TC-MRT-01 in [testing.md](../../apps/frontend/memo-return/testing.md).
- Not done: sec-auditor / security-auditor reviews, manual test, FE-MRT-004/005.

## Corrective work

None.
