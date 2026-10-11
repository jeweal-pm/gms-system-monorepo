# Project documentation

All project documentation and generated evidence live under `document/`.
Start with [ADR-0001](adr/0001-record-architecture-decisions.md),
[tech stack and dependencies](adr/tech-stack.md), and
[the UI delivery workflow](workflow/ui-delivery.md).

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
| `task/investigation/` | Audit findings awaiting owner review and selected later fixes |
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
Use [infra delivery](workflow/infra-delivery.md) when ADR/service changes affect containers;
[the service index](infra/service-index.md) tracks research/configuration coverage.
Use [DevOps delivery](workflow/devops-delivery.md) for GitHub CI/images and
[GitHub configuration](devops/github-configuration.md) to set the named variables later.

Migrated on 2026-10-11: root `docs/changelog/` -> `document/changelog/`,
`.ai/` -> `document/coordination/`, `user-check/` -> `document/testing/user-check/`,
and `skill_spec/` -> `document/skills/spec/`. Existing completed setup records remain in
[task/done/](task/done/2026-10-04-initial-frontend-backend-setup.md).
