# Project agent coordination

The project maintains twelve roles: `ui-spec`, `sa`, `lead-developer`,
`senior-react-developer` (frontend), `senior-nestjs-developer` (backend), `tester`,
`manual-tester`, `security-auditor`, `compliance-auditor`, `sec-auditor`, `infra`, and `devops`.
Canonical definitions are in `.codex/agents/`; `agents/` contains identical mirrors.
Project role configuration is in `.codex/config.toml`; prompt aliases are in `AGENTS.md`.

Read [UI delivery](../workflow/ui-delivery.md) for design -> approval -> frontend ->
SA approval -> backend -> frontend continuation. The parent coordinates this chain
automatically and records scoped handoffs. Do not claim a subagent ran if tools are unavailable.

## Scope and shared files

Use [ownership.yaml](ownership.yaml) and [tasks/TEMPLATE.md](tasks/TEMPLATE.md).
One active writer owns a scope. Sequential role handoffs can use the current checkout;
genuinely concurrent writers need isolated worktrees and branches. Share contracts, exact
revisions, approvals, allowed paths, and evidence using [handoffs/TEMPLATE.md](handoffs/TEMPLATE.md).

The parent integration owner serializes dependencies/lockfiles, composition roots, Prisma,
Docker, shared task pointers, and tech-stack updates. Approved frontend/backend proposals
can be installed during implementation through that serialized step. A proposal is never
treated as already installed.

Infra owns container research/configuration expertise; the parent explicitly assigns its
shared Docker/Compose/config edit scope as the sole writer and serializes the service index.
Frontend/backend own their application adapters; backend owns DB migrations.
Read [infra delivery](../workflow/infra-delivery.md).
Devops owns pipeline/release expertise; the parent serializes .github/** and the delivery
index. Read [DevOps delivery](../workflow/devops-delivery.md); deployment/publication still
needs its actual authorization and prerequisites.

## Branches and verification

Use the user's authorized branch and publication scope. Invocation alone does not authorize
a commit, push, PR, merge, or deploy. The existing staging -> develop branch policy in
ownership.yaml applies when that parallel-integration workflow is explicitly selected;
do not override the user's active branch instructions or invent absent CI/scripts.

Discover checks from package scripts and actual CI. Run relevant typecheck/lint/build and
meaningful behavior/contract checks for changed code. Compose validation is appropriate
for Docker changes; documentation-only tasks do not rebuild the application.

## Outputs and resources

Specifications: document/apps/; ADRs/stack: document/adr/; flows: document/diagram/;
reviews: document/reviews/<role>/; customer reports: document/testing/user-check/;
completion reports: document/task/done/; changelog: document/changelog/.
Audit findings first enter document/task/investigation/ for owner review. The parent owns
shared audit records; audit workers use isolated scratch. Frontend/backend take only the
user-selected ticket revision, and architecture changes keep the separate SA review.
Production is 8 GB RAM / 4 vCPU total; all roles preserve OS/Docker headroom.
