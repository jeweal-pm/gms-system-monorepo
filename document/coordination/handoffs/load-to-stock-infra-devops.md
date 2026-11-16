# Handoff: load-to-stock → infra and devops (new service `backend-api-inventory`)

- Feature ID / UI revision: `load-to-stock` / UI revision 1 (draft) + owner answers 2026-11-16
- SA revision / source UI revision: SA revision 1 (**pending-review**) / UI 1
- From role/scope: `sa` (documents only)
- To role/scope / parent integration owner: `infra` (research now on the draft; config after SA approval), then `devops`. Parent serializes every shared file listed below.
- Exact TODO IDs and source documents: INF-LS-001, DO-LS-001 in [task/todo/load-to-stock.md](../../task/todo/load-to-stock.md); [ADR-0052](../../adr/0052-load-to-stock-in-backend-api-inventory.md) D1/D2/D13/D14; [architecture](../../apps/backend/inventory/load-to-stock/architecture.md); [authorization](../../apps/backend/inventory/load-to-stock/authorization.md); [dependencies](../../apps/backend/inventory/load-to-stock/dependencies.md)
- Approval status, approved revision, and owner evidence: **none**. Draft ADRs permit research only ([infra-delivery](../../workflow/infra-delivery.md) step 3). No Compose, Dockerfile, nginx, secret or `.github` edit until the owner approves SA revision 1.
- Required contract / diagrams / ADRs: above; service-index comparison: `backend-api-inventory` has **no row** in [infra/service-index.md](../../infra/service-index.md) or the devops index → new-service trigger.
- Dependency ledger entries and installation status: `hono`, `@hono/node-server` **proposed** ([tech-stack](../../adr/tech-stack.md)); everything else reused.
- Allowed code/document paths: infra `document/infra/services/backend-api-inventory/1/**`; devops `document/devops/**`. Shared (parent-serialized, after approval): `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`, `docker/nginx/gms-dev.conf`, `backend-api-inventory/Dockerfile`, `.dockerignore`, `.env.example`, `.github/**`, `document/infra/service-index.md`, `document/infra/capacity.md`, `document/devops/service-index.md`.
- Integration-owned changes: all files above plus `pnpm-lock.yaml`, `backend-api-inventory/package.json`.

## Infra requirements (INF-LS-001)

| Topic | Requirement |
|---|---|
| Service | Compose service and DNS name **`backend-api-inventory`**; build `backend-api-inventory/Dockerfile` (context `.`, same Node 24.22.1 bookworm-slim base and multi-stage pattern as `backend-api-master`); `restart: unless-stopped`, `init: true`, `read_only: true`, tmpfs `/tmp` 16 MiB noexec, `cap_drop: ALL`, `no-new-privileges`, non-root user (do not repeat INV-20261017-004), json-file logs 10m×3, **no published ports** |
| Resources | `cpus: "0.20"`, `memory: 256M`, `pids: 128`, `NODE_OPTIONS=--max-old-space-size=160`. New Compose total 1.75 vCPU / 2880 MiB; update [capacity.md](../../infra/capacity.md). Dev watch override: 768 MiB like master |
| Port / health | `PORT=3301`; healthcheck `GET http://127.0.0.1:3301/health/ready` (2 s), interval 30 s, start_period 60 s |
| Networks | DB: join the internal DB network (today `partner-db`; a dedicated `inventory-db` internal network with postgres is preferred if infra agrees). New internal networks: `inventory-master` (inventory → api-master:3201 only), `auth-inventory` (inventory → backend-api-auth:3101 for JWKS + license), `inventory-web` (nginx → inventory). No egress to the internet |
| Database | Same PostgreSQL instance/database `f1_system`, schema `inventory`. Roles: `gms_inventory_migrator` (owner of schema `inventory`, used only by the one-off migrate job), `gms_inventory_app` (USAGE on `inventory`, DML on its tables, INSERT/SELECT only on `stock_movement`, no other schema), `gms_inventory_authz_reader` (CONNECT, USAGE on `auth`, SELECT on `auth.current_authorization` and `auth.permission_holders` only — grant migration in auth, BE-LS-001). Connections: app pool 5 + reader 1 (+1 during migration) |
| Migration job | One-off `backend-api-inventory-migrate` (same image, `prisma migrate deploy`, schema `inventory`) run after the master migration and before the service; not concurrent with other migrations |
| Secrets (files under `/run/secrets`, ≥ 32 random bytes) | `inventory_master_service_token` (mounted in inventory **and** api-master as `INVENTORY_MASTER_SERVICE_TOKEN_FILE`), `inventory_auth_service_token` (inventory **and** auth as `INVENTORY_AUTH_SERVICE_TOKEN_FILE`), DB URLs `INVENTORY_DATABASE_URL` (app role, `?schema=inventory`), `INVENTORY_AUTHZ_DATABASE_URL`, `INVENTORY_MIGRATE_DATABASE_URL` (job only) |
| Environment | `AUTH_SERVICE_URL=http://backend-api-auth:3101`, `AUTH_ACCESS_JWT_ISSUER`, `MASTER_INTERNAL_URL=http://api-master:3201`, `FRONTEND_URL`, `INVENTORY_TRUSTED_ORIGINS` (= master's list), `GMS_STORAGE_ROOT=/app/backend-api-inventory/storage`, `NODE_ENV=production` |
| Storage | Separate persistent host path, **not** master's: `${GMS_INVENTORY_STORAGE_HOST_PATH:-/srv/gms/inventory-storage}` bind → `/app/backend-api-inventory/storage` (writable). App writes only `files/load-to-stock/` via `@gms/storage`. Permanent retention (ADR-0030): no cleanup, include in backups with the DB; disk growth ≤ 5 MiB × 5 per load row worst case |
| Nginx (`docker/nginx/gms-dev.conf` and the production profile) | `location = /api/inventory/v1/notifications/stream` (proxy_buffering off, proxy_cache off, read timeout 120 s, HTTP/1.1, `Connection ""`) ; `location ^~ /api/inventory/v1/load-to-stock/photos` (client_max_body_size 5m + multipart overhead, same timeouts as the Purchase photo block); `location ^~ /api/inventory/` → `http://backend-api-inventory:3301` (client_max_body_size 256k); keep `/internal` and `/_storage` rejected; request id header as other blocks; `depends_on` inventory healthy |
| api-master | Add secret mount `inventory_master_service_token`, join `inventory-master` network. No other change now. Later (ADR-0052 D15 phase 2b, separate revision): a second secret `master_inventory_service_token` for master → inventory `/internal/v1/master/*` calls on the same network |
| auth | Add secret mount `inventory_auth_service_token`, join `auth-inventory` |
| Frontend | No env change (browser calls same-origin `/api/inventory/v1`); SSR does not call inventory in this revision |
| Rollback | Remove nginx locations → stop container; keep storage path and schema (data permanent) |
| Checks to record | compose config render, `nginx -t`, container non-root + read-only, healthy start, `/internal` 404 via nginx, privilege queries for the three roles, secret files mode 0400, idle RSS and RSS during a 200-row apply, host `free -m` with all containers |

## DevOps requirements (DO-LS-001, after INF-LS-001 and BE-LS-006)

- CI: add workspace `backend-api-inventory` to lint → build (`prisma generate` + `tsc`) → typecheck → test (vitest; integration tests need the disposable PostgreSQL service as master's) — reuse current scripts; no new tooling.
- Service-image workflow: add the `backend-api-inventory` Dockerfile target, linux/amd64, same provenance/publication gates (publication stays off by default). No deploy/restart/migration from CI.
- Variables/secrets ledger: the names above (values never in the repo); `.env.example` gets placeholders only.
- Not authorized: GitHub settings changes, remote runs, publishing, pushing or deployment.

## Handoff fields

- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): +0.20 vCPU / +256 MiB → 1.75 vCPU / 2880 MiB; headroom ≈ 0.25 vCPU / 1216 MiB. DB connections +6 (+1 job).
- Expected output and acceptance criteria: infra security bundle `document/infra/services/backend-api-inventory/1/security.md` with version-specific research (Node base image, Hono/node-server advisories, nginx SSE/upload settings), review-by date, and the exact Compose/nginx diff proposal for the SA review; devops pipeline diff after approval.
- Verification completed / not run: none (design stage).
- Blocking item: owner approval of SA revision 1 for config work; Q-LS-25/28/31 answers do not change the infra shape.
- Resume action and destination: infra research → bundle linked into the SA review → owner approval → BE-LS-001…006 → infra config (parent-serialized) → DO-LS-001 → frontend.
- Corrective work: none.
