# Project documentation

All project documentation and generated evidence live under `document/`.
Start with [ADR-0001](adr/0001-record-architecture-decisions.md),
[tech stack and dependencies](adr/tech-stack.md), and
[the UI delivery workflow](workflow/ui-delivery.md).
The [GMS platform engineering spec](gms-platform-spec.md) defines the target platform
and role-specific design rules; reconcile architecture changes with accepted ADRs before
implementation.
The [GMS migration SA revision 1](reviews/sa/2026-10-20-gms-platform-migration-rev1.md)
and [central migration TODO](task/todo/gms-platform-migration.md) were approved
for nonblocked work on 2026-10-20. The separate [license-server contract
revision 2](reviews/sa/2026-10-20-gms-license-contract-rev2.md) is owner-approved
for customer-backend code. External implementation, integration and capacity
verification remain open; the current protected routes and cutover remain unchanged.

| Folder | Purpose |
|---|---|
| `apps/frontend/template/` | Templates for every frontend feature bundle |
| `apps/frontend/<feature>/` | UI source analysis, components/tokens, behavior, data, dependencies, tests, TODO |
| `apps/backend/template/auth-service/` | Service templates; adapt auth examples to the owning domain |
| `apps/backend/<service>/<feature>/` | SA architecture, authorization, sequence/ER diagrams, API, dependencies, tests, TODO |
| `adr/` | Architecture decisions, ADR template, and central package status ledger |
| `spec/` | Shared product and API requirements |
| `diagram/` | Editable main business flows |
| `task/` | Task registry, latest frontend pointer, and `done/` completion records |
| `task/investigation/` | Audit findings and unresolved integration test blockers for owner review |
| `coordination/` | Scope ownership, task claims, cross-role handoffs |
| `testing/` | Test scenarios and `user-check/` customer reports/screenshots |
| `reviews/<role>/` | Technical review summaries; actionable audit findings link to investigation tickets |
| `changelog/` | Small change logs |
| `skills/spec/` | Project skill requirements |
| `infra/` | Container security research, service index, templates and revisioned config/rollout evidence |
| `devops/` | GitHub pipeline configuration, delivery service index, variables/secrets and release evidence |

Runtime instructions/configuration remain in root `AGENTS.md`, `.codex/`, and mirrored
`agents/`. Shared implementation guides are [frontend](apps/frontend/architecture.md) and
[backend](apps/backend/architecture.md). Global/plugin skill installations are outside scope.

Use `ui-spec <Figma URL or attached image>` to prepare a page review bundle. Once its exact
revision is approved, `frontend ทำตาม Todo list ล่าสุด` resolves
[frontend-latest.md](task/frontend-latest.md). New service changes go through `sa` and
separate owner review before automatic backend implementation and frontend continuation.
Packages stay proposed until approved and installed during implementation.

`sec-auditor` uses the pinned Cloudflare security-audit skill. Audit findings go to
[investigation](task/investigation/README.md) before frontend/backend remediation.
See [integration and validator instructions](skills/spec/sec-auditor-integration.md).
Selected fixes follow [bounded remediation](workflow/remediation.md), with persistent
cross-role attempt history, targeted verification, and explicit terminal outcomes.
Frontend/backend changes follow [automated testing](workflow/automated-testing.md): unit
and integration coverage is required for every affected item and must pass before handoff.
Their final code also passes the two focused [security reviews](workflow/security-review.md)
before handoff; findings enter investigation for owner review.
Use [infra delivery](workflow/infra-delivery.md) when ADR/service changes affect containers;
[the service index](infra/service-index.md) tracks research/configuration coverage.
Use [DevOps delivery](workflow/devops-delivery.md) for GitHub CI/images and
[GitHub configuration](devops/github-configuration.md) to set the named variables later.
For local containers and Prisma Studio, use the [development guide](infra/local-development.md).

Migrated on 2026-10-11: root `docs/changelog/` -> `document/changelog/`,
`.ai/` -> `document/coordination/`, `user-check/` -> `document/testing/user-check/`,
and `skill_spec/` -> `document/skills/spec/`. Existing completed setup records remain in
[task/done/](task/done/2026-10-04-initial-frontend-backend-setup.md).
