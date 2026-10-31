# Frontend TODO: memo-out-return

- feature-id: `memo-out-return`
- revision: 3
- status: **implemented** (FE-MOR-001…003; Memo Outstanding source and stock FE-MOR-004 later). Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย"; party = vendor (owner answer 2026-10-28).
- source: owner design 2026-10-28 ([source/01-memo-out-return-new.png](../../apps/frontend/memo-out-return/source/01-memo-out-return-new.png)); revision 1 was written from text only
- ui-spec: [ui-spec.md](../../apps/frontend/memo-out-return/ui-spec.md)
- dependencies: none new
- backend-bundles: [SA rev 1](../../apps/backend/master/memo-out/decisions.md) (shared with memo-out) + [ADR-0033](../../adr/0033-memo-documents-in-master-service.md), implemented 2026-10-28
- approved-revision: 3 (UI) + SA rev 1 (+ outstanding columns, owner instruction rev 3)
- approved-by: owner
- approved-at: 2026-10-28
- approval-evidence: owner 2026-10-28 rev 3: "frontend backend Memo Out Return head coulumn ยังไม่ตรง เอา More ออกและ เปลี่ยน head ให้ตรง สามารถแก้ไขได้แค่ column return" (with design source 02); rev 2: "Memo Out Return ยังไม่ตรง design เขียนuxuiเขียน spec และ frontend ทำ ui ให้ตรง" (with the design); rev 1: "uxui ทำ spec ของ Memo Out Return ให้หน่อยและ frontend ขึ้นหน้าโครง Memo Out Return ให้หน่อย". Spec and page structure only.
- review-bundle: [ui-spec](../../apps/frontend/memo-out-return/ui-spec.md), [open-questions](../../apps/frontend/memo-out-return/open-questions.md), [testing](../../apps/frontend/memo-out-return/testing.md)

## Implementation items

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | FE-MOR-001 | frontend | Page structure `/memo/memo-out-return` matching source 01 (rev 2: Vendor/Address header, Memo Outstanding button, `ReturnItemTable` with Pending/Return groups, note 0/250); shared preview frame (replaced by `features/trade-document/document-form.tsx` in FE-MOR-003); item table `emptyRowText` prop; sidebar link | `frontend/src/app/memo/memo-out-return/**`, `src/features/memo-out-return/**`, `src/features/trade-document/**`, `src/features/memo-out/**`, `src/features/quotation/components/items/ItemTable.tsx`, `src/features/home/navigation.ts` | — | UT-MOR-01…03, TC-MOR-01 |
| [x] | FE-MOR-002 | SA → backend | Memo Out Return API (`memoOutReturn.*`, tables, numbering `memo-out-return`, memo outstanding lines per party, partial return) | backend per SA | **requires-sa**, Q-MOR-02…09 (party: vendor per design) | — |
| [x] | FE-MOR-003 | frontend | Wire the page: vendors and addresses, Memo Outstanding picker, editable Return Pcs/Weight ≤ Pending, save/edit/delete, `/[id]`, daybook | `src/features/memo-out-return/**` | FE-MOR-002 | — |
| [x] | FE-MOR-005 | frontend + backend | Rev 3 item table: STOCK ID · LOT, Outstanding / Return groups, Memo PRICE, no More / checkbox / remove / row panel; only Return Pcs/Weight editable (≤ Outstanding); line columns `outstanding_pcs`, `outstanding_weight_ct` (migration `20261028120000_memo_out_return_outstanding`, CHECK) | `src/features/memo-out-return/**`, `src/features/trade-document/document-form.tsx`, `backend-api-master/src/trade-document/**`, `prisma/**` | owner instruction rev 3 | UT-MOR-02/03/06, UT-MO-B05/B11 |
| [ ] | FE-MOR-006 | SA → backend + frontend | Memo Stock / Memo Outstanding picker for vendor rows | — | Q-MOR-10 | — |
| [ ] | FE-MOR-004 | inventory | Stock back in on save | inventory service (ADR-0027) | inventory approval | — |

## Approval and revisions

- Revision 1 (2026-10-28): spec and page structure from owner text (no design image).
- Revision 2 (2026-10-28): owner design supplied; header, item button, item table and note limit changed to match it.
- Revision 3 (2026-10-28): owner design source 02; item table headers, no row menu, Return-only editing, Outstanding stored per line.

## Handoffs, evidence, and completion

- FE-MOR-001 evidence: see the frontend checks and the browser check below.
- FE-MOR-002/003 evidence: backend-api-master typecheck/lint, 395 tests (UT-MO-B01…B10, GP-MT-MO); frontend typecheck/lint, 437 tests; live via nginx :8080: Memo Out preview and saved number MO-1 from Document Setup, UI edit saved (version 2), Document Setup row reported used, daybook; Memo Out Return plain number 1, vendor + address, row shown under Return; test documents deleted.
- FE-MOR-005 evidence: backend-api-master typecheck/lint, 396 tests (UT-MO-B05/B11); frontend typecheck/lint, 438 tests (UT-MOR-02/03/06); live via nginx :8080: return created through the API with Outstanding 3 / 2.25, over-Outstanding rejected by the server and by the form, Return edited in the table to 3 / 2.250 and saved (version 2, amount 2,250.00); test document deleted.
- Not done: Memo Stock / Memo Outstanding picker (FE-MOR-006, Q-MOR-10; until then new returns can't get rows from the UI), line photos, stock posting, security reviews, manual test.

## Corrective work

None.

## Revision 4 (2026-10-31): customer party, Memo Outstanding picker, Approve returns stock — **approved**, in progress

- approved-revision: UI 4 / SA 2 / ADR-0033 rev 3 · approved-by: project owner · approved-at: 2026-10-31 · approval-evidence: Owner 2026-10-31: "อนุมัติ memo-out-return revision 4"

- Source: owner 2026-10-31 (verbatim in the [ui-spec](../../apps/frontend/memo-out-return/ui-spec.md#revision-4-2026-10-31-customer-party-memo-outstanding-picker-approve--draft-for-owner-review)).
- Bundle: [ui-spec rev 4](../../apps/frontend/memo-out-return/ui-spec.md), [Q-MOR-11…18](../../apps/frontend/memo-out-return/open-questions.md), [SA rev 2](../../apps/backend/master/memo-out-return/decisions.md), [api-contract](../../apps/backend/master/memo-out-return/api-contract.md), [database](../../apps/backend/master/memo-out-return/database-diagram.md), [sequence](../../apps/backend/master/memo-out-return/sequence-diagram.md), [flow](../../diagram/memo-out-return-flow.md), [ADR-0033 rev 3](../../adr/0033-memo-documents-in-master-service.md) (Proposed).
- Questions: Q-MOR-11…18 all answered by the owner 2026-10-31.
- Approval phrase: "อนุมัติ memo-out-return revision 4".
- Order after approval: backend → frontend → dual security review. It replaces FE-MOR-006 and closes Q-MOR-10 / Q-MO-12.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance / tests |
|---|---|---|---|---|---|---|
| [x] | BE-MOR-201 | backend | Migration `20261101090000_memo_out_return_customer` (guard, customer party, status/approval columns, `memo_out_line_id`, `memo_out_line.returned_*`, indexes) + Prisma schema | `backend-api-master/prisma/**` | approval | SA-MOR-18; IT on a disposable PG |
| [x] | BE-MOR-202 | backend | Service: customer adapter, `prepare` (SA-MOR-16), `outstanding` picker (SA-MOR-15), `approve` (SA-MOR-17), schemas | `src/trade-document/memo-out-return.service.ts`, `memo-schemas.ts`, `memo-out.service.ts` (export adapter only) | BE-MOR-201 | IT-MOR-01…06: save checks, picker, approve moves Reserve → pending, manual line, short guard, concurrent approvals |
| [x] | BE-MOR-203 | backend + parent | Router `outstanding`, `approve`; options = customers; tests | `src/master/router.ts`, `trpc-handler.ts` tests | BE-MOR-202 | UT router permissions |
| [x] | FE-MOR-201 | frontend | Header Customer / Address, Memo Outstanding dialog, status chip, Approve, error mapping; `/[id]`; daybook | `frontend/src/features/memo-out-return/**`, `src/features/trade-document/**` | BE-MOR-203 | UT-MOR-2xx; tsc, eslint |
| [ ] | FE-MOR-202 | frontend + parent | Full tests, live check (Memo Out approve → Return → approve → Memo Stock pending back, Memo Outstanding › Vendor Reserve falls), dual security review | — | all | all pass |

### Revision 4 evidence (2026-10-31)

- Backend:
  - Migration `20261101090000_memo_out_return_customer` (guarded, customer party, approval, `memo_out_line_id`, `memo_out_line.returned_*`, `memo_out_line_open_idx`).
  - `customerParty` / `customerDocumentOptions` shared with memo out; `MemoOutReturnService` `prepare` / `outstanding` / `approve`; `releaseToMemoStock`; router `outstanding`, `approve`.
  - Checks: `api-master` tsc, eslint, 418 unit tests pass.
  - Disposable PostgreSQL 18.6: all migrations in order, `test/trade-document` 9 files / 59 tests pass. New IT-MOR-01…06 cover the picker, save checks, approve Reserve → pending, the over-return guard, parallel approvals and RESTRICT.
- Frontend:
  - Header Customer + Shipping / Invoice (Memo Out's), Memo Outstanding dialog, approval (status chip, Approve, confirm), `MEMO_OUT_RETURN_OUTSTANDING_SHORT` message.
  - Checks: tsc, eslint 0 errors, 52 files / 525 tests pass (UT-MOR-21…23 added).
- Dev: migration applied (no memo out return existed); api-master and frontend restarted; `/memo/memo-out-return` 200; `memoOutReturn.outstanding` routed (401 without a session).
- Remaining: FE-MOR-202 dual security review; owner click-through.

