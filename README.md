# f1-system

Project-specific AI skills, subagents, and documentation for the Next.js frontend and
NestJS gateway/auth services.

## Project roles

Twelve agents are configured: `ui-spec`, `sa`, `lead-developer`, `senior-react-developer`,
`senior-nestjs-developer`, `tester`, `manual-tester`, `security-auditor`,
`compliance-auditor`, `sec-auditor`, `infra`, and `devops`. Canonical TOML definitions are in `.codex/agents/` with
identical mirrors in `agents/`; project roles are registered in `.codex/config.toml`.
Prompt shorthand routing is in [AGENTS.md](AGENTS.md).

| Prompt | Role / skill |
|---|---|
| `ui-spec <Figma URL or attached image>` | Analyze UI and prepare the feature's reviewable documents/TODO |
| `frontend ทำตาม Todo list ล่าสุด` | Resolve the latest approved frontend TODO and implement it |
| `sa` | Service architecture, sequence/ER diagrams, API contracts, ADRs, backend TODO |
| `backend` | Implement the approved service design |
| `manual-test` / `manual-tester` / `user test` | Customer-perspective UI checks |
| `sec-auditor` / `sec-audit` | Cloudflare security guidance or explicitly requested full audits |
| `infra` | Container security review and researched configuration for approved ADR services |
| `devops` | Senior DevOps for GitHub Actions, image builds and release/variable contracts |

All project documents are indexed in [document/README.md](document/README.md).
The [UI delivery workflow](document/workflow/ui-delivery.md) defines separate UI and SA
review, proposed -> approved -> installed package status, and automatic
frontend -> SA -> backend -> frontend continuation. The latest selected TODO is
[document/task/frontend-latest.md](document/task/frontend-latest.md).

Coordination and scope ownership are in
[document/coordination/README.md](document/coordination/README.md) and
[ownership.yaml](document/coordination/ownership.yaml). Customer reports/screenshots
live under `document/testing/user-check/`; completion reports under `document/task/done/`.

New skill/agent discovery can require a new session or app reload. Definitions inherit the
current session's model/effort/permissions and do not modify global or plugin skills.

Audit findings first enter [document/task/investigation/](document/task/investigation/README.md)
for owner review. Select a ticket later with `frontend แก้ investigation INV-...` or
`backend แก้ investigation INV-...`. Audits do not automatically change application code.
See [Sec Auditor integration](document/skills/spec/sec-auditor-integration.md) for the
pinned upstream source, evidence storage, and Linux validator runner on Windows.

Infra delivery is documented in [infra workflow](document/workflow/infra-delivery.md).
New/changed container ADRs trigger service-specific research through the parent; approved
configuration preserves required communication and the total 8 GB RAM / 4 vCPU budget.
Infra review findings enter investigation before `infra แก้ investigation INV-...`.

[CI](.github/workflows/ci.yml) checks all three apps on dev/master pushes and pull requests.
[Service images](.github/workflows/service-images.yml) is manual; publication defaults off.
See [GitHub variables/secrets setup](document/devops/github-configuration.md) and
[DevOps delivery](document/workflow/devops-delivery.md). No production deployment is enabled.

## Local application setup

The initial runnable application lives in `frontend/`, `backend-api-gateway/`, and `backend-api-auth/`.
It uses PostgreSQL and Mailpit from Docker Compose.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm docker:dev
```

The development Compose file bind-mounts the source and runs Next.js/Nest watch mode. Source edits are
picked up without rebuilding images. Compose builds the development image only the first time, or when
you explicitly run `pnpm docker:dev:build` after changing a Dockerfile. After changing package dependencies,
run `pnpm docker:dev:install` to update the shared dependency volumes without a Docker image rebuild.
The auth container regenerates Prisma Client from the mounted schema before applying migrations at startup,
so schema changes do not leave the persistent generated-client volume stale.
Use `pnpm docker:dev:logs` to follow logs and `pnpm docker:dev:down` to stop the stack.

Open `http://localhost:3000`; Mailpit is at `http://localhost:8025`. Create the first Super Admin through
the documented CRM endpoint; the generated password is delivered to the Mailpit inbox. The complete
PowerShell request and implementation notes are in [`document/task/done/2026-10-04-initial-frontend-backend-setup.md`](document/task/done/2026-10-04-initial-frontend-backend-setup.md).

Replace the development `AUTH_SECRET`, `CRM_API_KEY`, SMTP configuration, and database credentials before deploying outside localhost.
