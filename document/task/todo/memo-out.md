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
