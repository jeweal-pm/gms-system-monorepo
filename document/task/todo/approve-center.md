# TODO: approve-center

- feature-id: `approve-center`
- revision: 1 (UI rev 1; no SA revision)
- status: **approved** 2026-11-07; phase 1 (FE-AP-001…008) **implemented** 2026-11-07, security reviews and manual-tester pending (FE-AP-012); phase 2 (FE-AP-009…011) blocked on SA
- request: owner 2026-11-07, "uxui ช่วยเขียนสเปค … ของ Approve … หน้า Approve นี้จะเป็นหน้าที่ Approve แต่ละ transaction โดยจะมี Quotation, Reserve, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location และพวก memo (ยกเว้น memo outstanding)"; the owner wants frontend to build a first UI right after this spec.
- source: [source/01-approve-quotation-empty.png](../../apps/frontend/approve-center/source/01-approve-quotation-empty.png), [source/02-approve-reserve-pending.png](../../apps/frontend/approve-center/source/02-approve-reserve-pending.png)
- ui-spec: [ui-spec.md](../../apps/frontend/approve-center/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/approve-center/dependencies.md) — no new package; infra: none
- backend-bundles: none (phase 1 uses existing procedures). Phase 2 requires SA: [handoff](../../coordination/handoffs/approve-center-sa.md) (SA designing in parallel since 2026-11-07, Reject/Revise statuses included)
- approved-revision: 1 (UI rev 1)
- approved-by: owner
- approved-at: 2026-11-07
- approval-evidence: owner in chat 2026-11-07, "อนุมัติ เริ่มทำเลย", with answers to Q-AP-01/02/03 (below); every other question takes the spec default
- claimed-paths (frontend, 2026-11-07): `frontend/src/app/(app)/approve/**`, `frontend/src/features/approve-center/**`, `frontend/src/features/home/navigation.ts`, `frontend/src/features/home/sidebar.tsx`, `frontend/src/app/globals.css` (3 tokens), `frontend/test/approve-center/**`, `frontend/test/home/menu-access.test.ts`
- review-bundle: [ui-spec](../../apps/frontend/approve-center/ui-spec.md), [design-system](../../apps/frontend/approve-center/design-system.md), [conventions](../../apps/frontend/approve-center/conventions.md), [data-fetching](../../apps/frontend/approve-center/data-fetching.md), [error-handling](../../apps/frontend/approve-center/error-handling.md), [form-guidelines](../../apps/frontend/approve-center/form-guidelines.md), [dependencies](../../apps/frontend/approve-center/dependencies.md), [testing](../../apps/frontend/approve-center/testing.md), [open-questions](../../apps/frontend/approve-center/open-questions.md) (Q-AP-01…16), [flow](../../diagram/approve-center-flow.md), [SA handoff](../../coordination/handoffs/approve-center-sa.md)

## Implementation items

Phase 1 (FE-AP-001…008) is independent UI on existing APIs and may start once the owner approves revision 1. Phase 2 (FE-AP-009…011) is blocked on an approved SA bundle.

| Done | ID | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | FE-AP-001 | frontend | Routes `/approve` (redirect, Q-AP-04) and `/approve/[menu]`; `ApprovePanel` (C-AP-02/03); responsive rules; sidebar Approve → `/approve` with activePrefix; three proposed tokens | `frontend/src/app/(app)/approve/**`, `frontend/src/features/approve-center/**`, `frontend/src/features/home/navigation.ts`, `frontend/src/features/home/sidebar.tsx`, `frontend/src/app/globals.css`, `frontend/test/approve-center/**`, existing navigation tests | UI approval | Layout/sizes/colors per [ui-spec](../../apps/frontend/approve-center/ui-spec.md#page-structure-and-layout-1920--1080-desktop) and [design-system](../../apps/frontend/approve-center/design-system.md); breadcrumb Home › Approve › {Menu}; unknown slug → "Menu not found" | UT-AP-01, UT-AP-10, UA-AP-01, UA-AP-11 |
| [x] | FE-AP-002 | frontend | Menu registry (11 items, order Q-AP-03, availability, leaf, party) and visibility by `<leaf>:APPROVE` (Q-AP-13); sidebar Approve hidden when no item visible | same | FE-AP-001 | Items/visibility as specified; Super Admin sees all | UT-AP-01/02, IT-AP-01, UA-AP-09 |
| [x] | FE-AP-003 | frontend | Counts: per-menu `list({status:"PENDING_APPROVAL",limit:1}).total`; panel badges, "off", none; sidebar total badge (C-AP-01), `99+`; refetch on focus/mutation, no polling | same | FE-AP-002 | Badges per "Menu item states"; hidden while loading/on error; total = sum of visible | UT-AP-03, IT-AP-02, UA-AP-02 |
| [x] | FE-AP-004 | frontend | `ApprovalTable`: columns + per-menu Detail variants, adapters to `ApprovalRow`, "—" for fields phase 1 lacks, search (no./party/ref), client sort (default oldest first, Q-AP-11), Load more (50), states loading/empty/empty-search/error/no-VIEW | same | FE-AP-002 | Matches source 02 within ±2 px at 1920; source 01 empty text; deleted documents never listed | UT-AP-04/05/06, IT-AP-03, UA-AP-03/04/10 |
| [x] | FE-AP-005 | frontend | Row Approve: confirm (Q-AP-09) → `get` version → `approve`; invalidation; error mapping per [error-handling](../../apps/frontend/approve-center/error-handling.md) | same | FE-AP-004 | Success removes the row, counts drop, toast; each error case as documented; no double submit | UT-AP-07, IT-AP-04, UA-AP-05/06 |
| [x] | FE-AP-006 | frontend | Selection + bulk bar + Approve selected (sequential, progress, cancel, partial result) | same | FE-AP-005 | As in [ui-spec › Bulk selection](../../apps/frontend/approve-center/ui-spec.md#bulk-selection-and-approve-selected-default-not-in-design-q-ap-09) | UT-AP-08, IT-AP-05, UA-AP-07 |
| [x] | FE-AP-007 | frontend | Reject… / Revise… rendered disabled with info icon + tooltip | same | FE-AP-004 | Visible as designed, not clickable, keyboard-reachable tooltip | UT-AP-09 |
| [x] | FE-AP-008 | frontend | Load to Stock, Merge/Split Stock, Transfer Location: provisional header + "Not available yet" (Q-AP-07) | same | FE-AP-004 | No API call, no badge | UA-AP-08 |
| [ ] | FE-AP-009 | frontend | Switch counts to `approval.summary`; enriched rows (Qty, lines, stones, Submitted name/role/time, version, server sort); stone/Stock ID search | same | **requires-sa** SA-AP-01/02/03 + backend | "—" cells replaced; one count call; no `get` before approve | updated UT/IT |
| [ ] | FE-AP-010 | frontend | Reject… / Revise… dialogs and calls | same | **requires-sa** SA-AP-04 (Q-AP-01/02 answered 2026-11-07: Reject = final REJECTED with a required reason; Revise = back to the creator with a note, then resubmitted) | per approved SA bundle | new UT/IT |
| [ ] | FE-AP-011 | frontend | Inventory menus wired to their documents | same | **requires-sa** SA-AP-05 + those features | per their specs | new UT/IT |
| [ ] | FE-AP-012 | frontend + parent | Tests, typecheck, lint; both security reviews on the same final diff; manual-tester | — | all phase 1 items | all suites pass; reviews recorded in [testing](../../apps/frontend/approve-center/testing.md) | full frontend suite |

Backend items (BE-AP-*) come from SA rev 1 / ADR-0046 (accepted 2026-11-07, all defaults). **On hold:** the owner said "ยังไม่ต้องเริ่มทำ backend" (2026-11-07); do not dispatch until the owner says to start.

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

## Approval and revisions

| Revision | Date | Change | Status |
|---|---|---|---|
| 1 | 2026-11-07 | Initial spec from sources 01/02 and owner text | **approved** 2026-11-07 (owner, chat) |

## Owner answers (2026-11-07)

- **Q-AP-01 Reject…**: closes the document with a final **REJECTED** status and a required reason. New backend status and procedure (SA). Phase 1: disabled, tooltip "Reject is coming soon".
- **Q-AP-02 Revise…**: sends the document back to its creator to edit, with a note; the creator then resubmits. New backend status and procedure (SA). Phase 1: disabled, tooltip "Revise is coming soon".
- **Q-AP-03**: the panel follows the sidebar order: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location.
- All other questions use the spec defaults (Q-AP-04…16; see [open-questions](../../apps/frontend/approve-center/open-questions.md)).

## Handoffs, evidence, and completion

- SA: [approve-center-sa.md](../../coordination/handoffs/approve-center-sa.md) (SA designing phase 2 in parallel; frontend did not edit `document/adr/**` or `document/apps/backend/master/approve-center/**`).
- Phase 1 evidence (2026-11-07): [changelog](../../changelog/2026-11-07-approve-center-frontend.md); coverage map and results in [testing](../../apps/frontend/approve-center/testing.md). `tsc --noEmit` exit 0; ESLint 0 errors (2 existing warnings in `auth/login-form.tsx`); `vitest run` 86 files / 822 tests passed (before: 765; +57 in `test/approve-center/**`); frontend container restarted, `repair-dev-networks` OK, `/` and the `/approve/*` routes return 200; signed-in smoke of the 7 count lists, a pending list and `get` (version + lines) passed. Not run: a live approve (would change dev data), browser visual comparison with source 02, manual-tester.
- Open for FE-AP-012: `sec-auditor` + `security-auditor` on the final diff (parent), manual-tester.
- Deviations: (1) 1024–1279 px keeps the user's sidebar preference instead of forcing the rail (that needs `app-shell.tsx`, outside the claimed paths); (2) test fixtures live in `frontend/test/approve-center/fixtures.ts`, not `src/features/approve-center/fixtures.ts`, so they cannot reach the bundle; (3) with a search, the footer shows "Showing {n}" only, because the list `total` counts every pending document and ignores `q`; (4) the confirm dialog reuses `confirm-dialog.tsx`, whose confirm button is the danger style, as on the document pages.

## Corrective work

None. If a defect appears, use [bounded remediation](../../workflow/remediation.md): default 3 passes including the first fix, shared with backend; record the ledger here.
