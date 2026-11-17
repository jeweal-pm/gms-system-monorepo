# Backend dependency decisions: inventory / load-to-stock (SA revision 1, pending-review)

Ledger: [tech-stack.md](../../../../adr/tech-stack.md) (rows "Hono for `backend-api-inventory`" and "`@hono/node-server`" updated/added as **proposed**). Frontend: [frontend/load-to-stock/dependencies.md](../../../frontend/load-to-stock/dependencies.md) (no new package). Approval is not installation; the parent serializes `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (already matches `backend-api-*`) and the Dockerfile.

## New (proposed, not installed)

| Package | Workspace | Purpose | Version policy | Alternatives | Runtime cost |
|---|---|---|---|---|---|
| `hono` | `backend-api-inventory` | HTTP routing, middleware, `streamSSE` (`hono/streaming`), `hono/body-limit` | exact pin of the latest **4.x** stable release that is ≥ 2 weeks old at install; backend records the version and checks advisories | NestJS reuse (heavier, but known); bare `node:http` | small (few hundred KB); fits 256 MiB |
| `@hono/node-server` | `backend-api-inventory` | Node adapter (`serve`, graceful close) | exact pin, latest 1.x ≥ 2 weeks old compatible with the chosen hono | — (required on Node) | negligible |

No validator middleware package: Zod 4 is called explicitly in handlers.

## Reused (installed elsewhere; same exact versions in the new workspace)

| Need | Package / module | Where it is today |
|---|---|---|
| ORM / migrations | `prisma` 7.10.0, `@prisma/client` 7.10.0, `@prisma/adapter-pg` 7.10.0, `pg` 8.x | backend-api-master |
| Validation | `zod` 4.x | master, frontend |
| JWT verify | `jose` 6.2.12 | auth, master |
| Logging | `pino` 10.x (no nestjs-pino) | master |
| File storage | `@gms/storage` (workspace, fs driver, `StorageScope` write prefix `files/load-to-stock/`) | master, auth |
| UUIDv7 | `uuidV7` from `@gms/storage` | master |
| Decimal math | `Prisma.Decimal` (decimal.js bundled in Prisma runtime) | master |
| Tests | `vitest` 5.0.3, `typescript` ~5.9.3 | master |

## Code reused by porting (not a package)

The master auth context (`MasterJwksCache`, `current_authorization` row mapping, `verifyCsrfHeaders`, license client) is framework-agnostic except its tRPC error type. Backend ports it into `backend-api-inventory/src/platform/auth/` with the same limits and tests (UT-LS-B06). Extracting a shared `@gms/authz` workspace package is a later refactor, not part of this revision (it would change master).

## Master / auth changes (no package)

- `backend-api-master`: new internal controller + guard, migration, `issueStockIds` lock, Purchase in-use guard, approval types narrowed. No new package.
- `backend-api-auth`: reader-role grant migration and a second accepted service token for the license endpoint. No new package.

## Integration-owned files (parent serializes)

`backend-api-inventory/package.json`, `pnpm-lock.yaml`, `backend-api-inventory/Dockerfile`, `docker-compose*.yml`, `docker/nginx/gms-dev.conf`, `.env.example`, `.github/**`, `document/adr/tech-stack.md`, `document/infra/service-index.md`, `document/devops/service-index.md`, `document/task/index.md`, `document/task/frontend-latest.md`, `backend-api-master/src/app.module.ts`.

## Installed (backend, 2026-11-17, BE-LS-006)

| Package | Exact version | Note |
|---|---|---|
| `hono` | 4.13.18 | security release inside the 2-week window (INV-20261117-001); `hono/body-limit`, `hono/streaming` used; no `serveStatic` |
| `@hono/node-server` | 2.1.7 | 2.x instead of 1.x: the advisory database lists all 1.x ≥ 1.19.10 under GHSA-rmxm-3fg6-px4f; peer `hono ^4`, Node ≥ 20 |
| reused | `@prisma/client` / `@prisma/adapter-pg` / `prisma` 7.10.0, `jose` 6.2.12, `zod` ^4.4.3 (4.6.5), `pino` ^10 (10.4.0), `pg` ^8.16.3 (8.23.1), `vitest` 5.0.3, `typescript` ~5.9.3, `@gms/storage` workspace | no other new package |
