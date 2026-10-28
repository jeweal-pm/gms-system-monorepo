# Frontend TODO: memo-out-return

- feature-id: `memo-out-return`
- revision: 2
- status: **implemented** (FE-MOR-001…003; Memo Outstanding source and stock FE-MOR-004 later). Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย"; party = vendor (owner answer 2026-10-28).
- source: owner design 2026-10-28 ([source/01-memo-out-return-new.png](../../apps/frontend/memo-out-return/source/01-memo-out-return-new.png)); revision 1 was written from text only
- ui-spec: [ui-spec.md](../../apps/frontend/memo-out-return/ui-spec.md)
- dependencies: none new
- backend-bundles: [SA rev 1](../../apps/backend/master/memo-out/decisions.md) (shared with memo-out) + [ADR-0033](../../adr/0033-memo-documents-in-master-service.md), implemented 2026-10-28
- approved-revision: 2 (UI) + SA rev 1
- approved-by: owner
- approved-at: 2026-10-28
- approval-evidence: owner 2026-10-28 rev 2: "Memo Out Return ยังไม่ตรง design เขียนuxuiเขียน spec และ frontend ทำ ui ให้ตรง" (with the design); rev 1: "uxui ทำ spec ของ Memo Out Return ให้หน่อยและ frontend ขึ้นหน้าโครง Memo Out Return ให้หน่อย". Spec and page structure only.
- review-bundle: [ui-spec](../../apps/frontend/memo-out-return/ui-spec.md), [open-questions](../../apps/frontend/memo-out-return/open-questions.md), [testing](../../apps/frontend/memo-out-return/testing.md)

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | FE-MOR-001 | frontend | Page structure `/memo/memo-out-return` matching source 01 (rev 2: Vendor/Address header, Memo Outstanding button, `ReturnItemTable` with Pending/Return groups, note 0/250); shared preview frame (replaced by `features/trade-document/document-form.tsx` in FE-MOR-003); item table `emptyRowText` prop; sidebar link | `frontend/src/app/memo/memo-out-return/**`, `src/features/memo-out-return/**`, `src/features/trade-document/**`, `src/features/memo-out/**`, `src/features/quotation/components/items/ItemTable.tsx`, `src/features/home/navigation.ts` | — | UT-MOR-01…03, TC-MOR-01 |
| [x] | FE-MOR-002 | SA → backend | Memo Out Return API (`memoOutReturn.*`, tables, numbering `memo-out-return`, memo outstanding lines per party, partial return) | backend per SA | **requires-sa**, Q-MOR-02…09 (party: vendor per design) | — |
| [x] | FE-MOR-003 | frontend | Wire the page: vendors and addresses, Memo Outstanding picker, editable Return Pcs/Weight ≤ Pending, save/edit/delete, `/[id]`, daybook | `src/features/memo-out-return/**` | FE-MOR-002 | — |
| [ ] | FE-MOR-004 | inventory | Stock back in on save | inventory service (ADR-0027) | inventory approval | — |

## Approval and revisions

- Revision 1 (2026-10-28): spec and page structure from owner text (no design image).
- Revision 2 (2026-10-28): owner design supplied; header, item button, item table and note limit changed to match it.

## Handoffs, evidence, and completion

- FE-MOR-001 evidence: see the frontend checks and the browser check below.
- FE-MOR-002/003 evidence: backend-api-master typecheck/lint, 395 tests (UT-MO-B01…B10, GP-MT-MO); frontend typecheck/lint, 437 tests; live via nginx :8080: Memo Out preview and saved number MO-1 from Document Setup, UI edit saved (version 2), Document Setup row reported used, daybook; Memo Out Return plain number 1, vendor + address, row shown under Return; test documents deleted.
- Not done: Memo Outstanding picker (no vendor memo source yet; Pending shows —), line photos, stock posting, security reviews, manual test.

## Corrective work

None.
