# TODO: memo-receive

- feature-id: `memo-receive`
- revision: 4
- status: revisions 1–2 **implemented** 2026-10-28 (browser check by the owner pending); revision 3 **approved** 2026-10-29, in progress (see below)
- source: owner design 2026-10-28 ([page](../../apps/frontend/memo-receive/source/01-memo-receive-design.png), [row panel info](../../apps/frontend/memo-receive/source/02-row-panel-info.png)) + owner text
- ui-spec: [ui-spec.md](../../apps/frontend/memo-receive/ui-spec.md); answers: [open-questions.md](../../apps/frontend/memo-receive/open-questions.md)
- decision: [ADR-0033](../../adr/0033-memo-receive-frontend-mock.md) (Accepted)
- backend-bundles: none. Existing master APIs only (vendor, currency, stone master, document setup); Memo Receive documents are mock (owner 2026-10-28)
- dependencies: none new
- approved-revision: memo-receive UI revision 1 (answers Q-MR-01…07)
- approved-by: project owner
- approved-at: 2026-10-28T10:30+07:00
- approval-evidence: owner 2026-10-28, answers to Q-MR-01…07 and "ตอนนี้เเค่ทำ UI mock data พอยังไม่ต้องต่อ api จริง หรือ คิดว่าสามารถต่อกับ api จริงตัวอื่นก่อนได้ก็ต่อเลย เช่น stonemaster stone vendor document master currency เเค่ยังไม่ต้องทำของ memo receive"
- review-bundle: ADR-0033, ui-spec, open-questions, this TODO
- updated-at: 2026-10-28T10:30+07:00

## Frontend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MR-001 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Routes `/memo/memo-receive` + `[id]`, `REAL_PAGE_HREFS["memo-receive"]`, breadcrumb, `memo-receive` permission gate | `frontend/src/app/memo/memo-receive/**`, `frontend/src/features/home/navigation.ts` | approval | Sidebar opens the page; denied without VIEW | navigation test |
| [x] | FE-MR-002 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | `api.ts`: real reads (vendor.list/get, currency.options, stoneMaster.options + stoneCode.list/get, documentSetup.get `memo-receive`); mock locations; mock documents in memory + `localStorage` `gms.memo-receive.v1` (bounded, validated); number from Document Setup (plain without a row); Stock ID plain running 1, 2, 3; status Pending Approval | `frontend/src/features/memo-receive/**` | FE-MR-001 | Save/get/list/delete survive refresh; Stock IDs assigned on save, never reused | UT-MR-01…04 |
| [x] | FE-MR-003 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Schema (zod) + totals with no discount, reusing the Quotation calculator | same | FE-MR-002 | Matches ui-spec P-08…P-11, S | UT-MR-05 |
| [x] | FE-MR-004 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Page: header, info form, item table, row panel (Stock ID read-only "Auto", Location select, Memo Price, no line discount), photo box, document note (250), Summary Value without discount, Daybook. Quotation components read a `DocumentKind` context whose default keeps Quotation unchanged (ADR-0033 D5) | same + `frontend/src/features/quotation/components/**` and `frontend/src/features/quotation/document-kind.tsx` (context only) | FE-MR-003 | Matches the design and ui-spec; Quotation unchanged | UT-MR-06, existing quotation tests |
| [x] | FE-MR-005 | done 2026-10-28: frontend 432 tests, tsc, eslint pass; sec-auditor + security-auditor clear (advisory only: blob URLs not revoked, mock documents unencrypted in localStorage) | frontend + parent | Tests, typecheck, lint; dual security review (sec-auditor + security-auditor) | — | all | All suites pass | — |

## Revision 2 (owner 2026-10-28)

Direct owner instruction (verbatim in [ui-spec.md](../../apps/frontend/memo-receive/ui-spec.md)): Quantity & Price, line Discount (%) / Discount Amt and the Summary Value discount as Quotation; no Stone Code, the Stock ID leads instead.

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MR-006 | done 2026-10-28; frontend 433 tests, tsc, eslint pass; sec-auditor + security-auditor clear (advisory: discount limits must be re-checked by the future API; an amount discount has no upper bound, so totals can go negative) | frontend | `DocumentKind`: drop pricing/discount switches, add `stoneCode`; Memo Receive uses Quotation pricing and discounts; schema allows the document discount and checks line % ≤ 100; no Stone Code field/column/code list; table first column STOCK ID / LOT; panel title "Stock ID n" | `frontend/src/features/memo-receive/**`, `frontend/src/features/quotation/document-kind.tsx`, `frontend/src/features/quotation/components/items/**` | rev 1 | Matches rev 2; Quotation unchanged | UT-MR-05, UT-MR-06 |

## Decisions

Approved 2026-10-28 with the owner's answers to Q-MR-01…07 ([open-questions.md](../../apps/frontend/memo-receive/open-questions.md)); the owner noted the answers may change later.

## Revision 3 (owner flow 2026-10-29) — **approved**

- status: **approved** 2026-10-29 (Owner 2026-10-29: "อนุมัติ memo-receive revision 3"). This approval of this revision covers [ADR-0034](../../adr/0034-memo-receive-approval-and-memo-stock.md), the [SA bundle rev 1](../../apps/backend/master/memo-receive/decisions.md), [main flow](../../diagram/memo-receive-flow.md), [ui-spec rev 3](../../apps/frontend/memo-receive/ui-spec.md#revision-3-owner-2026-10-29-approved-with-sa-revision-1) and the owner answers Q-MR-08…13 (2026-10-29; Q-MR-09 still open, refusal over 9,999 for now). After approval, work runs in this order: backend → frontend.
- Source: the owner flow 2026-10-29 (verbatim in ADR-0034) and the design of the Memo Return "Add Memo Stock" dialog (shared in chat 2026-10-29). Stored as [01-add-memo-stock-dialog.png](../../apps/frontend/memo-return/source/01-add-memo-stock-dialog.png).
- backend-bundles: `document/apps/backend/master/memo-receive/` SA revision 1
- dependencies: none new

### Backend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-MR-001 | done 2026-10-29: models + migration; deploy, rollback (drop 5 tables) and re-deploy verified on disposable PostgreSQL 18.6 (127.0.0.1:55440, no project volume); no schema drift for the new tables; applied to local dev DB with `prisma migrate deploy` | backend | Prisma models + migration `20261029090000_memo_receive` (5 tables, CHECKs, indexes per database-diagram) | `backend-api-master/prisma/**`, `src/generated/**` | approval | migrate up and down on an empty DB | IT-MR-01 |
| [x] | BE-MR-002 | done 2026-10-29: `createStatus` / `editableStatuses` (default DRAFT), `lineOmit`, `lineHook` (kept ids + Stock IDs), `detailExtra`; status checked before version; memo-documents 10/10 and IT-MR-08 memo out regression pass | backend | Engine status config (`createStatus`, `editableStatuses`) and line-id hook; Memo Out/Return unchanged | `backend-api-master/src/trade-document/document-engine.ts` | BE-MR-001 | memo-out tests pass | IT-MR-08 |
| [x] | BE-MR-003 | done 2026-10-29: service + schemas + Stock ID counter (Bangkok year of the save, guarded upsert, injectable `clock`) + numbering key + `used`; IT-MR-01…04, 07, 08 pass (DB), UT-MR-S1/S2/ID1 pass | backend | `memo-receive.service.ts`: vendor adapter, Stock ID counter `YY####`, create/update/delete/list/get/nextNumber/options; server discount bounds | `src/trade-document/memo-receive.service.ts`, `memo-schemas.ts`, `document-errors.ts`, `src/document-setup/document-numbering.ts` | BE-MR-002 | SA-MR-03/04/08/09/10 | IT-MR-01…04, 07, 08 |
| [x] | BE-MR-004 | done 2026-10-29: guarded UPDATE + `memo_stock` createMany in one WRITE_TX; IT-MR-05 pass (repeat and parallel approve → STATUS_INVALID, no duplicate rows), UT-MR-P1 | backend | `approve` → APPROVED + `memo_stock` rows (location `Memo`) in one transaction | same | BE-MR-003 | SA-MR-05/06 | IT-MR-05 |
| [x] | BE-MR-005 | done 2026-10-29: one raw keyset query (LIMIT 51) on `memo_stock_pending_idx` (EXPLAIN: index scan, no sort); IT-MR-06 pass, UT-MR-P2/P3 | backend | `memo-stock.service.ts` `list` for the Add Memo Stock dialog | `src/trade-document/memo-stock.service.ts` | BE-MR-004 | SA-MR-11 | IT-MR-06 |
| [ ] | BE-MR-006 | code done 2026-10-29: router, `MasterMenu`, `currency.options`, trpc-handler + app.module wiring; UT-MR-R1 pass; typecheck + lint pass; full suite 405 passed / 27 skipped (DB-gated); dual security review done 2026-10-29 (sec-auditor clear; security-auditor: INV-20261029-002, INV-20261029-003 pending-review) | backend + parent | Router `memoReceive.*`, `memoStock.list`, `MasterMenu` + `currency.options` grants, composition root wiring; tests; dual security review | `src/master/router.ts`, `src/master/authorization.ts`, `src/app.module.ts` (parent-serialized) | BE-MR-005 | authorization.md | UT-MR-R1 |

### Frontend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MR-007 | done 2026-10-29: `api.ts` on `memoReceive.*` + `options` (+ `currency.options` for rates); mock store and `numbering.ts` deleted; `gms.memo-receive.v1` removed on load; error mapping per error-handling.md; UT-MR-F1 6/6 pass; live create/update/list verified | frontend | `api.ts` on `memoReceive.*` + `memoReceive.options`, remove the mock store and the `gms.memo-receive.v1` key, map errors | `frontend/src/features/memo-receive/**` | BE-MR-006 | save, edit, delete and list survive refresh across browsers | UT-MR-F1 |
| [x] | FE-MR-008 | done 2026-10-29: `DocumentKind.location` switch (Quotation `true`, Memo Receive `false`) in ItemTable/ItemEditorPanel; Stock ID "Auto" → server `YY####`; saved line ids sent on edit, new rows omit id; UT-MR-F2 + quotation tests pass | frontend | Remove the Location column and field; Stock ID "Auto" → `YY####` from the save result; keep line `id` on edit | same + `frontend/src/features/quotation/document-kind.tsx`, `…/components/items/**` (switch only, Quotation unchanged) | FE-MR-007 | ui-spec rev 3 | UT-MR-F2, quotation tests |
| [x] | FE-MR-009 | done 2026-10-29: header Approve (saved, PENDING_APPROVAL, view mode, not dirty, `memo-receive:APPROVE`) + confirm dialog + toast "Approved"; Approved hides Edit/Delete/Approve; CHANGED/STATUS_INVALID reload the document; UT-MR-F2 pass; live approve verified | frontend | Approve button + confirm + read-only Approved state, gated by `memo-receive:APPROVE` | `frontend/src/features/memo-receive/**` | FE-MR-007 | ui-spec rev 3 | UT-MR-F2 |
| [ ] | FE-MR-010 | code done 2026-10-29: row-panel photo box shows the "later update" note (no upload target); full frontend suite 44 files / 455 tests pass, tsc 0 errors, eslint 0 errors; dual security review done 2026-10-29 (sec-auditor clear; security-auditor: INV-20261029-002, INV-20261029-003 pending-review) | frontend + parent | Photo box "later update"; tests, tsc, eslint; dual security review | same | all | all suites pass | — |

Memo Return page and Add Memo Stock dialog UI: **not in this revision**. That needs a `ui-spec` for `memo-return`, which will consume `memoStock.list`.

## Revision 4 (owner 2026-10-29): line photos — **approved** (Owner 2026-10-29: "อนุมัติ memo-receive revision 4")

- Covers: SA revision 2 (SA-MR-14…19), ADR-0034 Revision 2, ui-spec revision 4. Owner request: "ทำให้เพิ่มรูปได้เลยได้ไหม". Order after approval: backend → parent nginx → frontend → dual security review.

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-MR-007 | done 2026-10-29 (backend; evidence [testing.md](../../apps/backend/master/memo-receive/testing.md#backend-verification-sa-revision-2-2026-10-29-be-mr-007)) | backend | Migration `20261029150000_memo_receive_line_photo` + model; photo controller `/api/v1/memo-receive/photos` reusing the quotation photo HTTP/storage code and the shared limiter; save/get handle `photoIds` (≤ 5, ready, own module) | `backend-api-master/prisma/**`, `src/trade-document/**`, `src/quotation/quotation-photo.*` (sharing only), `src/app.module.ts`, `src/main.ts` (parent-serialized) | approval | SA-MR-14…18 | IT-MR-09 upload/read/grants/limiter/foreign id; save keeps photo order — IT-MR-09 1/1, UT-MR-PH1…PH5 5/5, UT-MR-S3 pass; suite 421 passed / 18 skipped with DB, 411 / 28 without |
| [x] | INF-MR-001 | done 2026-10-29 (parent): location added to `docker/nginx/gms-dev.conf`, `nginx -t` ok, reloaded; unauthenticated POST/GET via :8080 → 401 from api-master | parent | nginx location `/api/v1/memo-receive/photos` (6 MB) in `docker/nginx/gms-dev.conf`; reload nginx | `docker/nginx/gms-dev.conf` | BE-MR-007 | SA-MR-19 | curl upload through :8080 |
| [x] | FE-MR-011 | done 2026-10-29: Memo Receive photo route as the row-panel upload target (`MEMO_RECEIVE_KIND.uploadPhoto` + `MEMO_RECEIVE_PHOTOS`), shared `uploadLinePhoto` in quotation api (Quotation unchanged), `photoIds` sent/loaded, `MEMO_RECEIVE_PHOTO_INVALID` mapped; UT-MR-F3 10/10 pass; live upload/save/read via :8080 pass (evidence [testing.md](../../apps/backend/master/memo-receive/testing.md#frontend-verification-ui-spec-revision-4-2026-10-29-fe-mr-011)) | frontend | Row-panel photo box on (DocumentKind photo upload target = memo-receive routes); thumbnails, main photo in the item card, read-only when Approved | `frontend/src/features/memo-receive/**`, `frontend/src/features/quotation/document-kind.tsx`, `…/components/items/**` (switch only) | INF-MR-001 | ui-spec rev 4 | UT-MR-F3 |
| [x] | FE-MR-012 | done 2026-10-29: frontend 465 tests, tsc, eslint pass; backend 421 tests (DB) pass; dual security review on the same revision: sec-auditor clear, security-auditor clear (advisory only: per-menu photo access as Quotation, unlinked uploads kept per ADR-0030, shared download slots) | frontend + parent | Tests, tsc, eslint; dual security review on the same revision | — | all | all pass | — |
