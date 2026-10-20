# Local Docker and Prisma Studio reconciliation — 2026-10-16

Status: completed for this workstation's development stack. Scope: existing frontend,
auth API, gateway API, partner API, PostgreSQL, and host Prisma Studio. No production
deployment or database reset was performed.

## Changes

- Refreshed workspace dependencies in the existing development node_modules volumes.
  The source is bind-mounted, so the shared `f1-system-dev:local` image did not need a
  rebuild for the latest frontend/backend files.
- Recreated the five Compose services without building images. Retained the PostgreSQL
  data volume and applied the existing auth and partner migrations.
- Used local frontend port 3002 because another local project occupies port 3000;
  matched the development auth callback URL to that port.
- Added an idempotent, project-scoped repair to the `docker:dev` scripts for missing
  `partner-db` and `partner-api` network attachments/DNS aliases observed with this
  workstation's Docker Engine 25.0.3 and Compose v2.24.6.
- Started host Prisma Studio bound to localhost: auth schema on port 5555, partner
  schema on port 5556. Usage and restart commands are in
  [the local development guide](../../infra/local-development.md).
- Removed the unused `axllent/mailpit:v1.29` image after confirming no container used it.
  The active shared development image and all volumes were retained.

## Verification

- Merged Compose config and repair script syntax: valid.
- `pnpm docker:dev`: services running; scoped network aliases repaired.
- Frontend `/login` on port 3002, auth `/health/ready` on 3101, gateway
  `/health/ready` on 4000, and both Prisma Studio pages: HTTP 200.
- Partner container: running and healthy after its four migrations.
- Prisma migration status: both auth and partner schemas up to date.
- No dangling Docker images remained after cleanup.

The local `.env` is gitignored. No secret values are recorded here. Current runtime and
source evidence is indexed in [the service index](../../infra/service-index.md).
