# Frontend TODO: document-setup

- feature-id: `document-setup`
- revision: 1
- status: **implemented** (frontend + backend; security reviews not run)
- source: owner text 2026-10-23 + reference image of another program ([source/01-reference-other-program.png](../../apps/frontend/document-setup/source/01-reference-other-program.png))
- ui-spec: [ui-spec.md](../../apps/frontend/document-setup/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/document-setup/dependencies.md) (no new package)
- backend-bundles: [SA rev 1](../../apps/backend/master/document-setup/decisions.md) approved and implemented 2026-10-23
- approved-revision: 1 (UI + SA)
- approved-by: owner
- approved-at: 2026-10-23
- approval-evidence: owner 2026-10-23: "frontend backend เริ่มทำ Document Setup เลย" (instruction to implement revision 1 with the proposed defaults Q-DS-01…10)
- review-bundle: [ui-spec](../../apps/frontend/document-setup/ui-spec.md), [form-guidelines](../../apps/frontend/document-setup/form-guidelines.md), [data-fetching](../../apps/frontend/document-setup/data-fetching.md), [error-handling](../../apps/frontend/document-setup/error-handling.md), [design-system](../../apps/frontend/document-setup/design-system.md), [conventions](../../apps/frontend/document-setup/conventions.md), [testing](../../apps/frontend/document-setup/testing.md), [open-questions](../../apps/frontend/document-setup/open-questions.md), [flow](../../diagram/document-setup-flow.md)

## Implementation items

| Done | ID | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | FE-DS-001 | frontend | Route + page frame (header, card layout, drawer toggle, push/overlay) | `frontend/src/app/setup/document-setup/**`, `frontend/src/features/document-setup/**` | — | Matches ui-spec layout; PC/iPad drawer rule from `drawer-layout.ts` | UT-DS-05, TC-DS-01, TC-DS-08 |
| [x] | FE-DS-002 | frontend | Transactions drawer (search, Not set up state, keyboard) | `features/document-setup/**` | FE-DS-008 for real data (fake adapter until then) | Q-DS-01 list; search by name/code | UT-DS-05, TC-DS-01 |
| [x] | FE-DS-003 | frontend | Document Setup card: Name, Code, Start From; defaults for never-set-up | `features/document-setup/**` | — | Form rules; defaults notice | UT-DS-01, UT-DS-04, TC-DS-02 |
| [x] | FE-DS-004 | frontend | Numbering table (useFieldArray): SNo, Date, Prefix, Suffix (separator), Start No, Example, remove; + Add row; In use / Upcoming | `features/document-setup/**` | Q-DS-04/05/06 defaults | Sort by Date on blur, unique Date, last row not removable, live Example | UT-DS-02, UT-DS-03, TC-DS-04, TC-DS-05 |
| [x] | FE-DS-005 | frontend | Declaration textarea + Save/Cancel/Edit, validation focus, error mapping, toast | `features/document-setup/**` | FE-DS-008 for server errors | error-handling table | UT-DS-01, UT-DS-06, TC-DS-03 |
| [x] | FE-DS-006 | frontend | Discard dialog on Cancel / switching transaction | `features/document-setup/**` | — | Keep editing keeps data | TC-DS-06 |
| [x] | FE-DS-007 | SA → backend | Permission leaf `document-setup` (VIEW, EDIT) in auth catalog; Setup tile + nav use it | auth catalog (backend); `features/setup/setup-destinations.ts`, `features/home/navigation.ts` (serialize) | **requires-sa** (Q-DS-07) | Tile hidden without VIEW; Edit needs EDIT | UT-DS-07, TC-DS-07 |
| [x] | FE-DS-008 | SA → backend, then frontend | Storage + `documentSetup.list/get/save` API (master service **A**), concurrency, `used` row flag; frontend wiring | backend per SA; `features/document-setup/api.ts`, hooks | **requires-sa** ([data-fetching.md](../../apps/frontend/document-setup/data-fetching.md)) | Contract approved by owner; IT-DS-01/02 pass | IT-DS-01, IT-DS-02 |

FE-DS-001…006 are independent UI (fake adapter allowed, clearly marked); FE-DS-007/008 wait for an approved SA revision.

## Approval and revisions

- Revision 1 (2026-10-23): first draft from the owner text and the reference image. Approved the same day — owner 2026-10-23: "frontend backend เริ่มทำ Document Setup เลย" (instruction to implement revision 1 with the proposed defaults Q-DS-01…10).

## Handoffs, evidence, and completion

- Backend: SA-DS-01…06 implemented in `backend-api-master` (`src/document-setup/**`, migration `20261023090000_document_setup`, router `documentSetup.*`) and the auth catalog leaf. Tests: UT-DS-B01…B08, GP-MT-DS (master 330 pass).
- Frontend: `src/app/setup/document-setup/page.tsx`, `src/features/document-setup/**`, Setup tile + navigation. Tests UT-DS-01…08 (frontend 385 pass); typecheck/lint pass.
- Live (dev, through nginx :8080): list 15, get null, save, stale → CHANGED, code clash → CODE_TAKEN, page renders view/edit/Add row; test data removed.
- Not done: sec-auditor / security-auditor reviews; manual customer test.

## Corrective work

None. Default pass limit 3 when work starts ([remediation](../../workflow/remediation.md)).
