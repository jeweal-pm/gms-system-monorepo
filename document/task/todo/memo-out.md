# Frontend TODO: memo-out

- feature-id: `memo-out`
- revision: 1
- status: **implemented** (FE-MO-001…003; From Stock/stock effect FE-MO-004 waits for inventory). Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย".
- source: owner design 2026-10-28 ([source/01-memo-out-new.png](../../apps/frontend/memo-out/source/01-memo-out-new.png))
- ui-spec: [ui-spec.md](../../apps/frontend/memo-out/ui-spec.md)
- dependencies: none new
- backend-bundles: [SA rev 1](../../apps/backend/master/memo-out/decisions.md) + [API contract](../../apps/backend/master/memo-out/api-contract.md) + [ADR-0033](../../adr/0033-memo-documents-in-master-service.md), implemented 2026-10-28
- approved-revision: 1 (UI) + SA rev 1
- approved-by: owner
- approved-at: 2026-10-28
- approval-evidence: owner 2026-10-28: "uxui ทำ spec ของ Memo Out ให้หน่อยและ frontend ขึ้นหน้าโครง Memo Out ให้หน่อย". API: owner 2026-10-28 "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย".
- review-bundle: [ui-spec](../../apps/frontend/memo-out/ui-spec.md), [open-questions](../../apps/frontend/memo-out/open-questions.md), [testing](../../apps/frontend/memo-out/testing.md)

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | FE-MO-001 | frontend | Page structure `/memo/memo-out` from the Quotation components; sidebar link; shared header/rail/note gain label props (Quotation defaults unchanged) | `frontend/src/app/memo/memo-out/**`, `src/features/memo-out/**`, `src/features/quotation/components/{header,rail,note}/**`, `src/features/home/navigation.ts` | — | UT-MO-01/02, TC-MO-01 |
| [x] | FE-MO-002 | SA → backend | Memo Out API (`memoOut.*`, tables `memo_out_*`, numbering from Document Setup `memo-out`; photos later), ADR-0033 | `backend-api-master/src/trade-document/**`, `prisma/**`, `src/document-setup/document-numbering.ts`, `src/master/**` | owner instruction 2026-10-28 | UT-MO-B01…B10, GP-MT-MO |
| [x] | FE-MO-003 | frontend | Wire the page to the API (shared `trade-document/document-form.tsx`): options, number preview, save/edit/delete, row panel (photos later), `/memo/memo-out/[id]`, daybook | `src/features/memo-out/**` | FE-MO-002 | — |
| [ ] | FE-MO-004 | inventory | From Stock and stock effect | inventory service (ADR-0027) | inventory approval | — |

## Approval and revisions

- Revision 1 (2026-10-28): spec and page structure from the owner design.

## Handoffs, evidence, and completion

- FE-MO-001 evidence: see the frontend checks and the browser check below.
- FE-MO-002/003 evidence: backend-api-master typecheck/lint, 395 tests (UT-MO-B01…B10, GP-MT-MO); frontend typecheck/lint, 437 tests; live via nginx :8080: Memo Out preview and saved number MO-1 from Document Setup, UI edit saved (version 2), Document Setup row reported used, daybook; Memo Out Return plain number 1, vendor + address, row shown under Return; test documents deleted.
- Not done: line photos, From Stock / stock posting (inventory), sec-auditor / security-auditor reviews, manual test.

## Corrective work

None.

## Revision 2 (2026-10-31): From Stock cuts Memo Stock at approval — **approved**

- revision: 2 (UI rev 2 + SA rev 2)
- status: **implemented** 2026-10-31 (BE-MO-201/202, FE-MO-201/202; FE-MO-203 tests and live check done, security reviews not run).
- request: owner 2026-10-31 "sa frontend backend Memo Out คือการตัดของจาก from stock โดยของจาก from stock จะมาจาก memoin และเมื่อทำ flow ของ Memo Out เสร็จของจะถูกตัดจริงๆ"; answers Q-MO-09…12 the same day.
- review-bundle:
  - [ui-spec rev 2](../../apps/frontend/memo-out/ui-spec.md)
  - [open questions Q-MO-09…15](../../apps/frontend/memo-out/open-questions.md)
  - [testing](../../apps/frontend/memo-out/testing.md)
  - [SA rev 2 decisions](../../apps/backend/master/memo-out/decisions.md)
  - [API contract rev 2](../../apps/backend/master/memo-out/api-contract.md)
  - [database diagram](../../apps/backend/master/memo-out/database-diagram.md)
  - [sequence diagram](../../apps/backend/master/memo-out/sequence-diagram.md)
  - [main flow](../../diagram/memo-out-flow.md)
  - [ADR-0033 revision 2](../../adr/0033-memo-documents-in-master-service.md)
- dependencies: none new
- approved-revision: UI rev 2 + SA rev 2 (with the Q-MO-15 defaults)
- approved-by: owner
- approved-at: 2026-10-31
- approval-evidence: owner 2026-10-31: "อนุมัติ memo-out revision 2"

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-MO-201 | backend | Migration `20261031090000_memo_out_from_stock` (status flow + approved_*, stock columns + CHECK + unique + index, `memo_stock_pending_all_idx`, DRAFT → PENDING_APPROVAL); Prisma schema | `backend-api-master/prisma/**` | approval | migrate deploy on dev + fresh DB; IT-MO-05 |
| [x] | BE-MO-202 | backend | `MemoOutService`: createStatus / editableStatuses, `prepare` (stock line rules SA-MO-13), line hook (memo_stock_id, stock_id, pending snapshot, output), `approve` (SA-MO-14, PENDING_SHORT); errors; `memoOut.approve` + list `status`; `memoStock.list` vendor optional + memo-out VIEW | `backend-api-master/src/trade-document/**`, `src/master/router.ts`, `src/common/errors.ts`, tests | BE-MO-201 | UT-MO-B11…B15, GP-MT-MO2, IT-MO-01…05 |
| [x] | FE-MO-201 | frontend | `memo-out/api.ts`: statuses, stock line fields, mapping, `useFromStock` (memoStock.list infinite), approve; schema rules (≤ pending, > 0, Sale Price on stock rows) | `frontend/src/features/memo-out/**` | BE-MO-202 | UT-MO-201…203 |
| [x] | FE-MO-202 | frontend | From Stock dialog (shared with Add Memo Stock layout, all vendors); picker config; stock rows read-only stone fields, editable Pcs/Weight ≤ pending with proportional weight, required Sale Price; Duplicate hidden on stock rows; approval config (badges, Approve, confirm, PENDING_SHORT) | `frontend/src/features/memo-out/**`, `src/features/trade-document/**`, `src/features/quotation/components/items/**` (stock-row quantity edit flag, Quotation unchanged) | FE-MO-201 | UT-MO-204/205, existing quotation / memo tests |
| [ ] | FE-MO-203 | frontend + parent | Tests, typecheck, lint; live TC-MO-02; sec-auditor + security-auditor on the final code | — | all | all suites pass |

### Revision 2 evidence (2026-10-31)

- backend-api-master: typecheck and lint clean. The full suite with a disposable PostgreSQL 18.6 passed 3 runs in a row: 442 passed, 18 skipped.
  - UT/GP: memo-documents, GP-MT-MO2.
  - IT-MO-01…05: `memo-out.db.integration.test.ts`.
  - Memo Return approval now uses the shared `takeFromMemoStock` (IT-MRT-* still pass).
  - DB test Stock ID years separated: memo return 70, memo out 71. Memo return had shared 60 with memo outstanding 60–69, which made parallel runs flaky.
- Migration `20261031090000_memo_out_from_stock`: applies cleanly on a fresh database and on the dev database (no memo outs to convert).
- frontend: typecheck clean, lint 0 errors (2 old warnings in login-form), 522 tests (UT-MO-201…205; memo return, quotation and table tests unchanged).
  - Shared pieces: `trade-document/memo-stock-modal.tsx` + `memo-stock-api.ts` (moved from memo-return), DocumentKind `stockQuantity`, `APPROVAL_STATUS_LABELS`, DocumentForm `kind`.
- Live TC-MO-02 through nginx :8080, superadmin, customer C001:
  1. From Stock listed every vendor's items ("from 1 · V001"). Item 260003 added: "Added 1 item from Stock".
  2. Row panel: stone fields locked, Pcs editable, "Pending 2 pcs / 1.360 ct". Pcs 1 → Weight 0.68; Sale Price 5000.
  3. Save → MO-1 Pending Approval; Memo Stock unchanged (2 / 1.360).
  4. Approve (confirm "Its 1 stock item is cut from Memo Stock…") → Approved, read-only, no Edit / Delete / Approve. Memo Stock 1 / 0.680; Memo Outstanding Reserve 1 / 0.680.
  5. Test data removed afterwards: MO-1 deleted and 260003 restored by SQL in the dev database.
- Not done: sec-auditor / security-auditor reviews, manual test.

## Revision 3 (2026-10-31): From Stock rows only — **done** (owner direct instruction)

- Evidence: owner 2026-10-31 "Q-MOR-13 ไม่ใช่คือหน้า memoout ทำผิดฝากเเก้ด้วยคือพิมไม่ได้เลยเเต่เเรกต้องเป็นของที่มาจาก from stock เท่านั้นเอาปุ่ม add row ออกด้วย". Spec: [ui-spec revision 3](../../apps/frontend/memo-out/ui-spec.md); SA-MO-18.

| Done | ID | Owner | Task | Verification |
|---|---|---|---|---|
| [x] | BE-MO-301 | backend | `memoOutRules`: line without `memoStockId` → `required` | UT-MO-B12, GP-MT-MO/MO2 updated; backend 417 tests, tsc, eslint pass |
| [x] | FE-MO-301 | frontend | `DocumentKind.pickOnly`: no Add row, empty row opens From Stock, Next row doesn't add; Memo Out uses it | UT-MO-F12; frontend 523 tests, tsc pass, eslint 0 errors |
| [ ] | FE-MO-302 | parent | Dual security review with memo-out-return revision 4 (same source revision) | — |
