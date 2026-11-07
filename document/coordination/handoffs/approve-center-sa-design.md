# Handoff: approve-center SA design revision 1 → owner review → backend

- **Status: approved, backend on hold.** SA revision 1 approved 2026-11-07: owner chat reply "ได้" on 2026-11-07, given after the summary offering "ใช้ default" (D1–D22 as drafted; OQ-AP-1…8 resolved to their defaults). The owner also said "ยังไม่ต้องเริ่มทำ backend": backend is on hold until the owner says to start. Do not dispatch backend until the owner explicitly says to start. Frontend phase 1 is unaffected.
- Feature ID / UI revision: `approve-center` / UI revision 1 (approved by the owner 2026-11-07, per the parent's dispatch)
- SA revision / source UI revision: 1 / 1
- From role/scope: SA (documents only, `sa-design-docs`)
- To role/scope / parent integration owner: owner review → parent dispatches backend (`senior-nestjs-developer`, scope `backend-service` for `backend-api-master/src/**`; auth migration under integration-owned `backend-api-auth/prisma/**`) → frontend FE-AP-009/010
- Source request: [approve-center-sa.md](approve-center-sa.md) (SA-AP-01…05) and owner answers 2026-11-07 (Q-AP-01 final REJECTED with reason; Q-AP-02 Revise back to creator with note, then resubmit; Q-AP-03 sidebar order; other questions at spec defaults)
- Bundle covered by approval: [ADR-0046](../../adr/0046-approval-review-status-and-approve-center-api.md) (Accepted 2026-11-07); [decisions](../../apps/backend/master/approve-center/decisions.md) D1…D22 and OQ-AP-1…8; [api-contract](../../apps/backend/master/approve-center/api-contract.md); [architecture](../../apps/backend/master/approve-center/architecture.md); [authorization](../../apps/backend/master/approve-center/authorization.md); [database-diagram](../../apps/backend/master/approve-center/database-diagram.md); [sequence-diagram](../../apps/backend/master/approve-center/sequence-diagram.md); [error-handling](../../apps/backend/master/approve-center/error-handling.md); [dependencies](../../apps/backend/master/approve-center/dependencies.md); [testing](../../apps/backend/master/approve-center/testing.md); [status flow](../../diagram/approve-center-review-flow.md); this handoff. No packages.
- Dependency ledger: none (tech-stack.md unchanged).
- Infra / devops: none (no container, image input, network, volume, variable or workflow change). Deployment order matters: auth migration before master code (D21).
- Security: both `sec-auditor` and `security-auditor` review the final backend diff once, including the auth view column (ADR-0031 boundary).
- Capacity (4 GB / 2 vCPU): no new process/pool/cache; `summary` 1 statement (≤ 700 partial-index entries); `pending` 1 statement, ≤ 51 rows; no polling/push. Measurements M-AP-01…03 before release.
- Corrective work: n/a. Pass limit: n/a.
- Stop reason: approved; stopped on owner hold ("ยังไม่ต้องเริ่มทำ backend").

## Backend TODO items (for the parent to merge into `document/task/todo/approve-center.md`)

SA did not edit the central TODO, `task/index.md` or `frontend-latest.md` (a frontend agent is editing them). Merge these rows into the "Implementation items" table and set "backend-bundles" to this bundle.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [ ] | BE-AP-001 | backend (auth migration, parent-serialized) | Auth view `current_authorization` + `user_name` appended (D5) | `backend-api-auth/prisma/migrations/<ts>_current_authorization_user_name/**`, `backend-api-auth/test/**` (view/privilege test) | SA approval | Column last; grants kept; reader still denied all tables | IT-AP-B12 |
| [ ] | BE-AP-002 | backend | Master auth reader/context: `user_name` → `principal.displayName`, `ctx.userName`; `requireAllMasterGrants`, `permittedApprovalTypes` | `backend-api-master/src/master/{authz-database,auth-context,authorization}.ts`, `backend-api-master/test/master/**` | BE-AP-001 | Null/blank/non-string name never fails auth | UT-AP-B10, GP-AP-03 |
| [ ] | BE-AP-003 | backend | Prisma schema + migration `20261107090000_approval_review` (11 columns, CHECKs, partial index, backfill) on 7 headers | `backend-api-master/prisma/schema.prisma`, `backend-api-master/prisma/migrations/<ts>_approval_review/**` | SA approval | No drift; backfill correct; version untouched; rollback script in the migration header | IT-AP-B01, B02, B11 |
| [ ] | BE-AP-004 | backend | Engine: submitted_* and totals on create/update; editable set; `review()`, `resubmit()`; detail fields; logs | `backend-api-master/src/trade-document/document-engine.ts`, `document-errors.ts`, `backend-api-master/test/trade-document/**` | BE-AP-003 | D1, D3, D4, D7, D13, D17 | UT-AP-B01…B06, B13 |
| [ ] | BE-AP-005 | backend | Seven services: editable `[PENDING, REVISION_REQUESTED]`, delegate reject/requestRevision/resubmit, actor name; `purchase.get` limits while editable; approve unchanged | `backend-api-master/src/trade-document/*.service.ts`, `customer-stock-document.ts`, `src/purchase/**`, `src/purchase-order/**`, matching tests | BE-AP-004 | D8, D9, D10 | UT-AP-B07, B08 |
| [ ] | BE-AP-006 | backend | Schemas: status enums (+2), `reject`/`revision` input schemas (trim 1–500, strict) | `src/trade-document/memo-schemas.ts`, `src/purchase/purchase.schemas.ts`, `src/purchase-order/purchase-order.schemas.ts`, new `src/approval/approval.schemas.ts` | — | D2, D3 | UT-AP-B09 |
| [ ] | BE-AP-007 | backend | Router: `reject`, `requestRevision` (APPROVE+CSRF), `resubmit` (EDIT+CSRF) on 7 routers | `backend-api-master/src/master/router.ts`, `test/master/router.test.ts` | BE-AP-005/006 | D11 | GP-AP-01, GP-AP-04 |
| [ ] | BE-AP-008 | backend | Approval registry + `summary` (one UNION ALL, cap 100, permitted types) | `backend-api-master/src/approval/**`, `test/approval/**` | BE-AP-002/003 | D14, D15 | UT-AP-B11, IT-AP-B08 |
| [ ] | BE-AP-009 | backend | `pending`: rows, 5 sorts × dir, keyset cursor bound to sort/q, search incl. stone/Stock ID, READ_TX | same | BE-AP-008 | D16, D18 | UT-AP-B12, IT-AP-B09, B10 |
| [ ] | BE-AP-010 | backend + parent | `approval` router; register `ApprovalService` (`app.module.ts` parent-serialized), `trpc-handler.ts`; update `signedIn()` comment | `src/master/router.ts`, `src/master/trpc-handler.ts`, `src/app.module.ts` (parent) | BE-AP-008/009 | D11, D14 | GP-AP-02, GP-AP-03 |
| [ ] | BE-AP-011 | backend | DB integration: no stock change on reject/revise; revise→edit→resubmit→approve; readers exclude; soft-delete interplay; races | `backend-api-master/test/**` | BE-AP-005/007 | D8, D9 | IT-AP-B03…B07 |
| [ ] | BE-AP-012 | backend + parent | Full backend suites, typecheck, lint; M-AP-01…03 on a data copy; both security reviews once on the same revision; return verified contract to frontend | — | all BE-AP | all pass; measurements recorded in testing.md | full master + auth suites |

## Frontend notes (for the parent; frontend owns the TODO rows)

- FE-AP-009: `approval.summary` (sidebar total = Σ counts, `99+` above 99; count 100 = "100 or more"), `approval.pending` rows and server sort/search; approve with `row.version` (no `get`); reset paging on sort/search change and on `VALIDATION_ERROR cursor`.
- FE-AP-010: Reject… / Revise… dialogs (reason / note 1–500, plain text), calling `<doc>.reject` / `<doc>.requestRevision`; invalidate summary + pending + `<doc>.get/list`. **Also the seven document pages** (D22): status maps for `REJECTED` / `REVISION_REQUESTED` (`frontend/src/features/trade-document/document-api.tsx` status dot and each page's status handling), banners, Resubmit (EDIT) on `REVISION_REQUESTED`, read-only `REJECTED`, list status filters. This touches files outside `frontend/src/features/approve-center/**`; the parent should widen FE-AP-010's allowed paths (and, if the owner wants a visual spec for the banners, route a small ui-spec revision). Ship the document-page status handling **before or with** enabling the Reject/Revise buttons.
- Submitted cell shows the name only (D6); `null` → "—". Existing pending documents show "—" until resubmitted.
- Inventory menus stay "Not available yet" (FE-AP-008/011 unchanged).

## Resume action

Approved 2026-11-07 (evidence in ADR-0046 and decisions.md; OQ-AP-1…8 = defaults). **Backend on hold**: when the owner explicitly says to start backend, the parent merges BE-AP-001…012 into the central TODO (if not already) and dispatches backend in order BE-AP-001 → 002/003 → 004…011 → 012, then frontend FE-AP-009/010. No further SA approval is needed for this revision.
