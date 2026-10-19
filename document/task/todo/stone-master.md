# TODO: stone-master

- feature-id: `stone-master`
- revision: 1
- status: **approved** (UI revision 1 + SA revision 1); implemented 2026-10-19 — tables in PostgreSQL schema `stone` (owner change); see the [changelog](../../changelog/2026-10-19-stone-master.md)
- source: owner images 2026-10-19 (seven supplied, six unique) in [source/](../../apps/frontend/stone-master/source/)
- ui-spec: [ui-spec.md](../../apps/frontend/stone-master/ui-spec.md); open questions: [open-questions.md](../../apps/frontend/stone-master/open-questions.md)
- backend-bundle: SA revision 1 proposal [decisions.md](../../apps/backend/partner/stone-master/decisions.md) + [ADR-0024](../../adr/0024-stone-master-in-partner-service.md) (Proposed)
- dependencies: none new ([dependencies.md](../../apps/frontend/stone-master/dependencies.md))
- infra/devops: none (SA-SM-12)
- approved-revision: UI revision 1 + SA revision 1 + ADR-0024 revision 1
- approved-by: project owner
- approved-at: 2026-10-19
- approval-evidence: owner 2026-10-19: "อนุมัติ stone-master UI rev 1 และ SA rev 1" (Q-SM-01…09 use the documented defaults)
- updated-at: 2026-10-19

## Backend (after SA approval)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [ ] | BE-SM-001 | implemented; security review passed (advisory) | backend | Prisma models + migration `…_stone_master` (SA-SM-03/05, indexes SA-SM-11) | `backend-api-partner/prisma/**` | SA approval | Migration applies on a copy of the dev DB; constraints as specified | migrate deploy in dev |
| [ ] | BE-SM-002 | implemented; security review passed (advisory) | backend | Partner module `stone-master`: shared simple-kind service + Stone Name, Shape, Stone Code services; code rules, references, in-use, concurrency | `backend-api-partner/src/stone-master/**`, `app.module.ts` | BE-SM-001 | SA-SM-04…09 | UT-SM-P01… (schemas, auto code, size-in-shape, in use, conflict) |
| [ ] | BE-SM-003 | implemented; security review passed (advisory) | backend | Partner internal routes (list/get/create/update/delete/options) with the service-token guard | same | BE-SM-002 | SA-SM-07/08 bounds | controller tests |
| [ ] | BE-SM-004 | implemented; security review passed (advisory) | backend | Gateway schemas + `stoneMaster.*` router factory with `permittedProcedure("stone-master", …)` | `backend-api-gateway/src/trpc/**` | BE-SM-003 | SA-SM-02/10 | UT-SM-G01… (permissions, validation, mapping) |
| [ ] | BE-SM-005 | done 2026-10-19 (18/18 live checks through the gateway; test data removed) | backend | Live integration check through the gateway (dev) + handoff to frontend | — | BE-SM-004 | All procedures answer as contracted | curl checks recorded |

## Frontend (after UI approval; data items after BE-SM-005)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-SM-001 | implemented; security review passed (advisory); browser not run | frontend | Generalize partner header/drawer/dialogs to `MasterEntity`; move multi-select to `components/ui/` | `frontend/src/features/partner/**`, `frontend/src/components/ui/**`, `frontend/src/features/user-permission/**` (import only) | UI approval | Vendor/customer/user-permission unchanged | UT-SM-09, existing tests |
| [ ] | FE-SM-002 | implemented; security review passed (advisory); browser not run | frontend | Routes `/setup/stone-master[/page]`, context nav group, sidebar/Home hrefs, Master Code tile | `frontend/src/app/setup/stone-master/**`, `frontend/src/features/home/navigation.ts`, `frontend/src/features/setup/**` | FE-SM-001 | All entry points open the pages; VIEW gating | UT-SM-01, UT-SM-08, TC-SM-01, TC-SM-11 |
| [ ] | FE-SM-003 | implemented; security review passed (advisory); browser not run | frontend | Shared Stone Master page: header modes, permissions, drawer, discard/delete dialogs, print | `frontend/src/features/stone-master/**` | FE-SM-002 | Matches S1; 2026-10-17 permission rules | TC-SM-02, TC-SM-10 |
| [ ] | FE-SM-004 | implemented; security review passed (advisory); browser not run | frontend | Simple pages ×6 wired to the API | same | FE-SM-003, BE-SM-005 | Create/edit/delete/duplicate | UT-SM-02/06/07, TC-SM-02/03/09 |
| [ ] | FE-SM-005 | implemented; security review passed (advisory); browser not run | frontend | Stone Name (group select, HSN) | same | FE-SM-004 | Matches S2 with DV-02/03 | TC-SM-04 |
| [ ] | FE-SM-006 | implemented; security review passed (advisory); browser not run | frontend | Shape (sizes multi-select) | same | FE-SM-004 | Matches S3 with DV-04 | TC-SM-05 |
| [ ] | FE-SM-007 | implemented; security review passed (advisory); browser not run | frontend | Stone Code: modes, parts, size-in-shape, reorder (mouse + keyboard), live Auto code | same | FE-SM-005/006 | Matches S4–S6 with DV-05/07 | UT-SM-03/04/05, TC-SM-06/07/08 |
| [ ] | FE-SM-008 | tests pass (partner 271, gateway 234, frontend 289); pages 200 after restart; dual security review passed (advisory: INV-20261019-001, -002); browser/manual test not run | frontend + parent | Tests, restart + integration check, dual security review | — | all | Suites pass; reviews clear/advisory | testing.md |

## Decisions needed from the owner

1. Approve **UI revision 1** (or name changes), including DV-01…07.
2. Approve **SA revision 1 + ADR-0024**, or name an SA-SM ID to change.
3. Answer Q-SM-01…05 (blocking), or accept the defaults.
