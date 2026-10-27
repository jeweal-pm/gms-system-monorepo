# TODO: decimal-setup

- feature-id: `decimal-setup`
- revision: 1
- status: **approved** 2026-10-27 (UI revision 1); implemented 2026-10-27 — frontend only with mock data, no backend or database (owner)
- source: owner text 2026-10-27 (no design image)
- ui-spec: [ui-spec.md](../../apps/frontend/decimal-setup/ui-spec.md); open questions: [open-questions.md](../../apps/frontend/decimal-setup/open-questions.md)
- backend-bundle: none (API out of scope, Q-DEC-06)
- dependencies: none new
- approved-revision: decimal-setup UI revision 1 (defaults Q-DEC-01…07)
- approved-by: project owner
- approval-evidence: owner 2026-10-27 "อนุมัติ decimal-setup UI rev 1 ทำเเค่หน้าบ้านเเค่ mock data นะ อย่าพึ่งไปยุ่งกับ db หลังบ้าน"
- updated-at: 2026-10-27

## Frontend (after UI approval)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-DEC-001 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Route `/setup/decimal-setup`, Setup tile "Decimal Setup" (gated by `document-setup` for now, Q-DEC-05), breadcrumb | `frontend/src/app/setup/decimal-setup/**`, `frontend/src/features/setup/setup-destinations.ts`, `frontend/src/features/home/navigation.ts` | approval | Tile opens the page; hidden without permission | setup-destinations test |
| [x] | FE-DEC-002 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Mock data + `api.ts` (in memory + localStorage, Promise with delay) | `frontend/src/features/decimal-setup/**` | FE-DEC-001 | Save survives a refresh; swap point is `api.ts` only | UT-DEC-01 |
| [x] | FE-DEC-003 | done 2026-10-27; frontend tests 425 pass; browser not run | frontend | Page: header (Edit/Cancel/Save), Default card + Apply to all, table by section with weight/price selects and live examples, search, view/edit modes, discard dialog, toast | same | FE-DEC-002 | Matches ui-spec F-01…F-08 and states | UT-DEC-02…04 |
| [x] | FE-DEC-004 | done 2026-10-27: frontend 425 tests, tsc, eslint pass; sec-auditor + security-auditor clear (no findings) | frontend + parent | Tests, typecheck, lint; dual security review | — | all | All suites pass | — |

## Decisions needed from the owner

1. Approve **decimal-setup UI revision 1** (or name a field/section to change).
2. Answer Q-DEC-01…07 in [open-questions.md](../../apps/frontend/decimal-setup/open-questions.md), or accept the defaults.
