# TODO: memo-outstanding-vendor

- feature-id: `memo-outstanding-vendor`
- revision: 1
- status: **approved** 2026-10-29, in progress
- source: owner design 2026-10-29 ([source/](../../apps/frontend/memo-outstanding-vendor/source/)) + owner text (verbatim in the ui-spec)
- ui-spec: [ui-spec.md](../../apps/frontend/memo-outstanding-vendor/ui-spec.md); questions: [open-questions.md](../../apps/frontend/memo-outstanding-vendor/open-questions.md) (Q-MOV-01…09; owner answers 2026-10-29)
- decision: [ADR-0035](../../adr/0035-memo-outstanding-vendor-report.md) (Accepted)
- backend-bundles: [SA rev 1](../../apps/backend/master/memo-outstanding-vendor/decisions.md)
- dependencies: none new
- approved-revision: UI 1 / SA 1 · approved-by: project owner · approved-at: 2026-10-29 · approval-evidence: Owner 2026-10-29: "อนุมัติ memo-outstanding-vendor revision 1"
- Order after approval: backend → frontend → dual security review.

Frontend evidence: [testing.md](../../apps/backend/master/memo-outstanding-vendor/testing.md#frontend-verification-2026-10-29-fe-mov-001004). Remaining: FE-MOV-004 dual security review (`sec-auditor` + `security-auditor`) on the same revision, routed by the parent.

## Backend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-MOV-001 | done 2026-10-29 | backend | Migration `20261030090000_memo_stock_buckets` (6 columns, CHECKs, partial index) + Prisma model; approve still writes buckets 0 | `backend-api-master/prisma/**`, `src/generated/**`, `src/trade-document/memo-receive.service.ts` (insert defaults only) | approval | SA-MOV-02 | IT-MOV-01 pass |
| [x] | BE-MOV-002 | done 2026-10-29 | backend | `memo-outstanding.service.ts` + schemas: vendorSummary, vendorList, vendorItems, vendorOptions | `src/trade-document/memo-outstanding.*` | BE-MOV-001 | SA-MOV-03…09 | IT-MOV-02…05 pass (6/6 incl. vendorOptions) |
| [x] | BE-MOV-003 | done 2026-10-29 | backend + parent | Router `memoOutstanding`, `MasterMenu` + wiring; tests | `src/master/router.ts`, `src/master/authorization.ts`, `src/master/trpc-handler.ts`, `src/app.module.ts` (parent-serialized) | BE-MOV-002 | authorization.md | UT-MOV-R1 pass |

Backend evidence: [testing.md](../../apps/backend/master/memo-outstanding-vendor/testing.md#backend-verification-2026-10-29-be-mov-001003). Full api-master suite 412 passed / 34 skipped; DB integration (disposable PostgreSQL) 39/39 in `test/trade-document/`.

## Frontend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MOV-001 | done 2026-10-29 | frontend | Route `/memo/memo-outstanding/vendor`, `REAL_PAGE_HREFS["memo-outstanding-from-vendor"]`, breadcrumb, VIEW gate; `api.ts` on `memoOutstanding.*` | `frontend/src/app/memo/memo-outstanding/vendor/**`, `frontend/src/features/memo-outstanding-vendor/**`, `frontend/src/features/home/navigation.ts` | BE-MOV-003 | sidebar opens page; denied without VIEW | UT-MOV-NAV pass (2), UT-MENU-05b updated |
| [x] | FE-MOV-002 | done 2026-10-29 | frontend | KPI cards, filter bar (search, vendor popover, doc-date range) in URL params, table with grouped Pcs/Weight columns, due labels, sort, pager 10/25/50, empty, error and loading states | `frontend/src/features/memo-outstanding-vendor/**` | FE-MOV-001 | ui-spec Layout/Table/States | UT-MOV-F1 pass (13), IT-MOV-F1 pass (2) |
| [x] | FE-MOV-003 | done 2026-10-29 | frontend | Expand rows (vendorItems, cached), Show subtasks Collapsed/Expanded, Customize view panel (locked + toggles, kept per browser), item selection bar, Print view (PRINT), Excel unavailable | same | FE-MOV-002 | ui-spec Table/Behavior | UT-MOV-F2 pass (12) |
| [x] | FE-MOV-004 | done 2026-10-29: frontend 494 tests, tsc, eslint pass; backend 412 + DB 39 pass; dual security review on the same revision: sec-auditor clear, security-auditor clear with one hardening ticket INV-20261029-004 (pending-review) | frontend + parent | tests, tsc, eslint; dual security review on the same revision | — | all | all pass | vitest 48 files / 494 tests pass; tsc clean; eslint 0 errors |
