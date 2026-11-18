# Container security: backend-api-inventory / 1

## Selection and inventory

- Service ID / infra revision / status: `backend-api-inventory` (plus one-off `backend-api-inventory-migrate`) / 1 / **implemented-unverified** (local-dev Compose + Nginx config written and statically validated; image not built, containers not started, application source not yet present).
- Parent task / exact ADR paths and revisions / user authorization evidence: INF-LS-001 in [task/todo/load-to-stock.md](../../../../task/todo/load-to-stock.md); [ADR-0052](../../../../adr/0052-load-to-stock-in-backend-api-inventory.md) D1/D2/D12/D13/D14 (Accepted 2026-11-17, sha256 `2225f073…a65ce25a`); requirement [load-to-stock-infra-devops.md](../../../../coordination/handoffs/load-to-stock-infra-devops.md) (sha256 `cdf89853…245b8e1`); SA bundle [inventory/load-to-stock](../../../../apps/backend/inventory/load-to-stock/architecture.md) (architecture, authorization, dependencies). Owner approval 2026-11-17 "อนุมัติ UI rev 1 + ADR-0052 + SA rev 1", relayed by the parent, which assigned infra as sole writer of Compose, `docker/**`, Nginx and Dockerfiles for this session.
- ADR-0027 naming reconciliation: ADR-0027/GMS spec's working name `api-inventory` is replaced by ADR-0052 D1. Compose service, DNS name and workspace are `backend-api-inventory`; Nginx prefix stays `/api/inventory/`. No `api-inventory` alias is created.
- Config/image/source hashes (sha256, after this revision): `docker-compose.yml` `af1bbd07891879206ce5f6e3658816e65c35e10d8700fdc7305b09849caed279`; `docker-compose.dev.yml` `d45effc4104cfe2442cfeb0ac758199e5415aa374f7cd56e15121a3a0f98a601`; `docker-compose.gms.dev.yml` `90a1dc234ef52985a66b0c33247ba8ab20a4011fd307a6ad0ba43b2fa27a90b5`; `docker/nginx/gms-dev.conf` `ad062ea994ecedd4c6132e9749f3c9de4706cffaf060199ddd0adfb50b8030f3`; `backend-api-inventory/Dockerfile` `9ed4416d524f13e6b029d0fb584e743c8c2845e11b312f1c00e22d883c846bfb`; `docker/dev.Dockerfile` `03a9a39784eba26cf336ec796bd70cdc7057cff46aa4fad7fe88b1f50e4d0d44`; `docker/repair-dev-networks.cjs` `6b22e3a67b095434a3dea8acf09a0f742d3b45d9e5ccfacbb503c0b1d214977c`; `.dockerignore` `756bd572…b8ca1`; `.gitignore` `58c9a3ca…7b622`. Base commit `4254526` (branch `feat/17-11-26-load`, uncommitted).
- Engine/Compose/platform: Docker Engine 29.8.0, Compose v5.5.1 (Docker Desktop, Windows host, linux/amd64 VM). Production target: linux/amd64, 4 GB / 2 vCPU (ADR-0024); production host OS/version still unselected.
- Image provenance: `node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54` (official image, multi-arch OCI index; linux/amd64 manifest `sha256:0e2646ab…6680e`, built 2026-11-11 from docker-node `1274f3ee`, base `debian:bookworm-slim`), verified with `docker buildx imagetools inspect` on 2026-11-17. Local dev uses the shared `f1-system-dev:local` image (still Node 24.22.1, see INV-20261110-005).
- Compose files in order: production-like `docker-compose.yml` + `docker-compose.gms.dev.yml`; local GMS preview `docker-compose.yml` + `docker-compose.dev.yml` + `docker-compose.gms.dev.yml` (`pnpm docker:gms:preview`). No profiles; one replica; helper job `backend-api-inventory-migrate` (run-to-completion, `restart: "no"`).
- Research date: 2026-11-17. Review-by: **2026-12-17** (one month: Node 24 LTS and Hono both shipped security releases within the last three weeks). Triggers: any Node/Debian base change or new Node security release; a Hono or `@hono/node-server` advisory or version change; Nginx image/version change or advisory (the Nginx 1.30.6 candidate's own review-by is 2026-11-20 in gms-target, refreshed below); Engine/Compose upgrade; changed ports/networks/secrets/storage/env contract; a second inventory replica; production host selection.
- Fresh advisory/image-support check for this implementation: done 2026-11-17 (sources below).

## Version research (2026-11-17)

| Component | Finding | Decision |
|---|---|---|
| Node.js 24 LTS ([dist index](https://nodejs.org/dist/index.json), [v24.22.3 release](https://nodejs.org/en/blog/release/v24.22.3)) | 24.22.3 (2026-11-11) is a security release: high-severity HTTP/2 and TLS fixes, medium HTTP/https fixes, undici 7.30.2, llhttp 9.4.4. The existing services' 24.22.1 lacks it. | New image uses 24.22.3 by digest. The service listens on plain HTTP/1.1 inside the private network, so the HTTP/2/TLS items mostly affect outbound/TLS paths, but the release also updates llhttp/undici used on every request. Bumping auth/master/frontend/dev images is **not** done here (shared dev image rebuild); evidence added to [INV-20261110-005](../../../../task/investigation/INV-20261110-005-container-image-refresh-hardening.md). |
| Debian bookworm-slim | Supported (Debian 12 LTS); same family as the other services. Image OS packages not scanned (no scanner available locally). | Keep for consistency; scan in devops CI (DO-LS-001). |
| `hono` ([advisories](https://github.com/honojs/hono/security/advisories), [releases](https://github.com/honojs/hono/releases)) | 4.13.16 (Nov 1) and **4.13.18** (Nov 11) carry security fixes: `bodyLimit()` memory exhaustion with tiny chunks (GHSA-39q9-qp46-w8xg, affects 4.12.16–4.13.17), `validator()` content-type parameter bypass (GHSA-92p4-j3wq-jmqx, GHSA-4h7h-rv7c-7m2v), `csrf()` `text/ping` (GHSA-46wx-v44x-9hh2), `mount()` and RegExpRouter middleware bypasses, `serveStatic` double-decode. | **Requirement: `hono` ≥ 4.13.18.** The SA rule "latest 4.x ≥ 2 weeks old" would select ≤ 4.13.14 and therefore the vulnerable `bodyLimit`/`validator` the design uses. Recorded as [INV-20261117-001](../../../../task/investigation/INV-20261117-001-inventory-hono-minimum-secure-versions.md) for backend. |
| `@hono/node-server` ([advisories](https://github.com/honojs/node-server/security/advisories), [releases](https://github.com/honojs/node-server/releases)) | Backslash path rewrite behind a reverse proxy (GHSA-jpvv-r467-5p4w / CVE-2026-126210; fixed 1.19.18 / 2.1.6), `serveStatic` double decode (fixed 1.19.19 / 2.1.7), WebSocket items (not used). | **Requirement: ≥ 1.19.19 (1.x) or ≥ 2.1.7 (2.x).** Defense in depth in Nginx: raw backslash in the path of `/api/inventory/*` returns 400 (verified below). Do not use `serveStatic`. |
| Nginx `nginxinc/nginx-unprivileged:1.30.6-alpine3.24` (digest unchanged) ([advisories](https://nginx.org/en/security_advisories.html), [proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)) | 1.30.6 is "not vulnerable" for the eight latest advisories (all fixed in 1.30.6 / 1.30.4–5). `proxy_buffering off` passes the response synchronously; `proxy_read_timeout` applies between two reads. | No image change. SSE location mirrors the existing master stream block. |
| Docker Compose ([services reference](https://docs.docker.com/reference/compose-file/services/)) | `service_completed_successfully` gates the app on the job; file-based secrets are bind mounts and **ignore `uid`/`gid`/`mode`** without Swarm. | Secret file permissions are a host responsibility (below). |

## Official research and control decisions

| Setting/control | Source / version | Value | Reason | Exception / compatibility | Owner |
|---|---|---|---|---|---|
| Runtime user | Node official image (`node` uid 1000); Dockerfile `USER` | `USER 1000:1000` in image and `user: "1000:1000"` in Compose (service and job) | Avoid INV-20261017-004 (root runtime) | Dev overlay resets to root, as api-master (shared dev image, bind mount, pnpm) | infra |
| init | Compose `init` | `true` | Signal handling / zombie reaping; graceful SSE close | — | infra |
| Capabilities / privilege escalation | Compose `cap_drop`, `security_opt` | `cap_drop: [ALL]`, `no-new-privileges:true`; default seccomp/AppArmor profile retained | Port 3301 > 1024; no capability needed | Dev resets `cap_drop` (as master) | infra |
| Root filesystem | Compose `read_only`, `tmpfs` | read-only; `/tmp` 16 MiB `noexec,nosuid,nodev`; only writable path the storage bind | Immutable code | Dev writable root (watch) | infra |
| Resources | Compose `deploy.resources.limits` | 0.20 vCPU, 256 MiB, pids 128; `NODE_OPTIONS=--max-old-space-size=160` (same for the job) | ADR-0052 D14 | Dev: 0.5 vCPU / 768 MiB / heap 512 (job 0.5 / 512 MiB) | infra |
| Logs | json-file | 10 MiB × 3 | Same as master/nginx | Spec target 10 MiB × 5 not adopted for consistency; revisit with production profile | infra |
| Published ports | — | none | Internal only (ADR-0052 D1) | — | infra |
| Health | Compose healthcheck | `GET http://127.0.0.1:3301/health/ready`, 2 s abort, interval 30 s, timeout 5 s, retries 3, start_period 60 s, start_interval 5 s | Readiness separate from SSE | `/health/ready` is a backend contract (BE-LS-006) | backend endpoint, infra probe |
| Secrets | Compose file secrets → `/run/secrets/*`; app reads `*_FILE` | `inventory_master_service_token`, `inventory_auth_service_token` | Not in env/image | Mode not enforced by Compose (bind mount); on Linux host make the files owned by root, group-readable by gid 1000 or mode 0444 inside a 0700 directory; never inside the repo/build context | infra (mount), backend (reader), parent (create values) |
| DB credentials | Compose env | `INVENTORY_DATABASE_URL`, `INVENTORY_AUTHZ_DATABASE_URL`, `INVENTORY_MIGRATE_DATABASE_URL` as env (same pattern as master) | Prisma/pg read URLs from env | Visible to `docker inspect` on the host; a `_FILE` reader for DB URLs is a follow-up hardening for the production profile, not in this revision | backend/infra |
| Build context | `.dockerignore` | `.env*`, `document`, `.github`, storage dirs incl. `backend-api-inventory/storage` and `/storage-inventory` excluded | No secrets/uploads in image | — | infra |
| Egress | internal networks only | none | Inventory calls only auth, master and postgres | Prisma checkpoint disabled (`CHECKPOINT_DISABLE=1`) | infra |

## Required and prohibited communication

| Caller | Callee/DNS | Port/protocol | Network(s) / host bind | Auth | Readiness / egress | Acceptance |
|---|---|---|---|---|---|---|
| Browser | Nginx `/api/inventory/v1/*` | 8080 (host 127.0.0.1:8080 and `${DEV_LAN_NGINX_BIND}:80`) | default | access-token cookie, Origin/Fetch-Metadata CSRF (app) | — | Positive: list/get 200 when signed in. Negative: `/internal/*` and `/_storage/*` 404; raw `\` in path 400 |
| Nginx | `backend-api-inventory:3301` | HTTP/1.1 | `inventory-web` (internal) | forwards Host, X-Forwarded-*, X-Request-Id, cookies | depends_on inventory healthy | 502 when inventory down (other routes unaffected at runtime) |
| inventory | `backend-api-auth:3101` (JWKS + private license endpoint) | HTTP/1.1 | `auth-inventory` (internal) | `INVENTORY_AUTH_SERVICE_TOKEN_FILE` bearer on license only | JWKS cached by app | Wrong/absent token → 401 from auth; master token remains separate |
| inventory | `api-master:3201` `/internal/v1/inventory/*` | HTTP/1.1, 5 s timeout, ≤ 4 sockets (app) | `inventory-master` (internal) | `INVENTORY_MASTER_SERVICE_TOKEN_FILE` bearer, accepted only on that prefix | master healthy before start | Token refused on other master routes; `PARTNER_SERVICE_TOKEN` refused on the prefix |
| api-master | `backend-api-inventory:3301` `/internal/v1/master/*` | — | `inventory-master` | phase 2b `master_inventory_service_token` — **not configured in this revision** | — | Bridge membership exists, no credential yet: route must reject |
| inventory / job | `postgres:5432` | PostgreSQL | `inventory-db` (internal, new) | app role / authz reader role / migrator role | postgres healthy | Roles cannot read `partner`/`stone`/auth base tables |
| inventory | Internet | — | none (no `default` network) | — | no egress | DNS/external connect fails |

Docker bridge membership is not per-port access control: on `inventory-master` master can reach inventory and vice versa; on `auth-inventory` inventory can reach every auth route; the tokens and route guards are the control. Inventory is **not** on `partner-db`, `auth-master`, `master-web` or `default`.

## Nginx

Added to `docker/nginx/gms-dev.conf` (before `location /`):

- `location = /api/inventory/v1/notifications/stream`: `proxy_buffering off`, `proxy_cache off`, read/send timeout 120 s (server pings 25 s). No gzip is configured on this server, so no compression delay. **Deviation from the handoff:** no `proxy_set_header Connection ""` here, because any `proxy_set_header` in a location stops inheritance of the server-level Host/X-Forwarded-*/X-Request-Id headers; the server-level `Connection` value (`close` without an Upgrade header) is harmless for an SSE response and matches the verified master stream block.
- `location ^~ /api/inventory/v1/load-to-stock/photos`: `client_max_body_size 6m` (5 MB + multipart), same as the other photo blocks.
- `location ^~ /api/inventory/`: `client_max_body_size 256k`.
- Each block: `if ($request_uri ~ "^[^?]*\\\\") { return 400; }` (raw backslash in the path only; the query string is untouched).
- `/internal` and `/_storage` rejection unchanged; master/auth/frontend blocks unchanged.

## Storage, init and data protection

- Writable paths: `/tmp` tmpfs 16 MiB; `/app/backend-api-inventory/storage` bind from `${GMS_INVENTORY_STORAGE_HOST_PATH:-/srv/gms/inventory-storage}` (production-like) or `${GMS_INVENTORY_STORAGE_DEV_PATH:-./storage-inventory}` (dev). Separate from master's `/srv/gms/storage` / `./storage`; neither service mounts the other's root, and Nginx mounts neither. App writes only `files/load-to-stock/` through `@gms/storage` (`StorageScope`). Image pre-creates `storage/files/load-to-stock` owned by 1000:1000; a host bind replaces it, so on Linux the host directory must be created and `chown 1000:1000` before first start (Docker Desktop on Windows maps permissions).
- Retention: permanent (ADR-0030); no purge configured. Disk growth bounded only per document (≤ 200 rows × 5 photos × 5 MB). Include the path in the file backup with the DB (recovery contract still open in GF-07/GP-INF).
- Database: existing `postgres:18.6-alpine` with its existing `postgres-data` volume; no init script change (init variables do not reconfigure existing data). Schema `inventory` and roles are provisioned out of band:
  - `gms_inventory_migrator`: LOGIN, owner of schema `inventory` (create schema with `AUTHORIZATION gms_inventory_migrator`), used only by the job;
  - `gms_inventory_app`: LOGIN, USAGE on `inventory`, DML on its tables, INSERT/SELECT only on `stock_movement`, nothing in other schemas (default privileges granted by the migrator);
  - `gms_inventory_authz_reader`: LOGIN, CONNECT, USAGE on `auth`, SELECT on `auth.current_authorization` and `auth.permission_holders` only.
  - Backend owns the reviewed provisioning SQL (pattern: `backend-api-master/prisma/roles/provision-master-authz-reader.sql`, refuse if the role exists or PUBLIC has auth access) and the grant migrations (BE-LS-001, BE-LS-007). Running it on the local DB is a manual, separately authorized DB-owner step; never at app start.
- Migration: one-off `backend-api-inventory-migrate` (`prisma migrate deploy` with `INVENTORY_MIGRATE_DATABASE_URL`) after `api-master` is healthy (master migrates at its own start) and before the service (`service_completed_successfully`). Prisma takes a database advisory lock, so a concurrent migration from another service waits rather than interleaving.
- Dev exceptions: root, writable root fs, bind-mounted checkout, watch mode, migrate job runs `db:generate && db:migrate` in the dev image; same internal networks (no egress, no published port).

## Capacity

| | CPU | Memory | Heap | Pids |
|---|---|---|---|---|
| backend-api-inventory | 0.20 | 256 MiB | 160 MiB | 128 |
| backend-api-inventory-migrate (one-off, exits before the service starts) | 0.20 | 256 MiB | — | 128 |

- Aggregate (base + GMS overlay, production limits): before **1.55 vCPU / 2624 MiB** (postgres 0.60/1024, auth 0.30/512, api-master 0.25/384, frontend 0.30/640, nginx 0.10/64); after **1.75 vCPU / 2880 MiB**. The job never overlaps the service, so the peak stays 2880 MiB. Headroom on 2 vCPU / 4096 MiB: ≈ 0.25 vCPU / 1216 MiB for OS, Docker and page cache.
- DB connections: +5 app pool, +1 authz reader, +1 during migration; master 5 + 1, auth unchanged; well below PostgreSQL's default 100 and the spec's 40-connection planning ceiling.
- Concurrency bounds are application-side (ADR-0052 D14): ≤ 200 SSE streams/process (≤ 3/user), ≤ 3 concurrent photo transfers, pickers ≤ 50, master calls 5 s / ≤ 4 sockets. 200 idle SSE sockets stay well inside the container's file-descriptor and Nginx worker limits; per-stream memory must be measured.
- Not measured: idle RSS of the built image, RSS/p95 during a 200-row apply, 200-stream memory, host `free -m` with all containers. Static caps are not proof of fit.
- The stale "1.70 vCPU / 2944 MiB" figure elsewhere is the pre-GMS five-service stack with `backend-api-gateway` (0.25/384) and without Nginx; see [capacity.md](../../../capacity.md).

## Rollout and verification

- Claimed infra paths: `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`, `docker/nginx/gms-dev.conf`, `docker/dev.Dockerfile`, `docker/repair-dev-networks.cjs`, `backend-api-inventory/Dockerfile`, `.dockerignore`, `.gitignore`, this bundle, `capacity.md`, `service-index.md`.
- Backend contract the image/Compose depend on (BE-LS-006/007; not yet present at the time of writing):
  - package `@gem-crm/backend-api-inventory` in `backend-api-inventory/`; scripts `build` (= `prisma generate` + `tsc`, emits `dist/main.js`), `dev` (watch), `db:generate`, `db:migrate` (= `prisma migrate deploy`); `prisma` CLI installed in the workspace (`node_modules/.bin/prisma`); Prisma client output `src/generated/prisma` (dev volume); dependency on `@gms/storage` (`workspace:*`); `pnpm-lock.yaml` importer added.
  - `prisma.config.ts` datasource: `INVENTORY_MIGRATE_DATABASE_URL ?? INVENTORY_DATABASE_URL`, no credential fallback in production, no `.env` read needed in the container.
  - Runtime env: `PORT`, `INVENTORY_DATABASE_URL`, `INVENTORY_AUTHZ_DATABASE_URL`, `AUTH_SERVICE_URL`, `AUTH_ACCESS_JWT_ISSUER`, `MASTER_INTERNAL_URL`, `FRONTEND_URL`, `INVENTORY_TRUSTED_ORIGINS`, `GMS_STORAGE_ROOT`, `INVENTORY_MASTER_SERVICE_TOKEN_FILE`, `INVENTORY_AUTH_SERVICE_TOKEN_FILE`; refuse to start (non-zero exit) when a required one is empty — the base file passes empty strings when unset so postgres-only commands keep working.
  - `GET /health/ready` without auth, answering within 2 s, not touching the SSE stream.
  - auth reads `INVENTORY_AUTH_SERVICE_TOKEN_FILE` (already in the working tree); master reads `INVENTORY_MASTER_SERVICE_TOKEN_FILE` (BE-LS-004).
- Rollback: remove the three Nginx inventory locations and the nginx `depends_on`, stop `backend-api-inventory`; keep the storage path and schema (permanent data). Removing the inventory networks/secrets from auth/master recreates those containers only.
- Static checks performed 2026-11-17:
  - `docker compose config --quiet` for base, base+dev and base+dev+gms with the real `.env` plus a scratch env file of dummy inventory values: all exit 0. With the real `.env` alone, base and base+dev pass; base+dev+gms fails as intended until `INVENTORY_AUTHZ_DATABASE_URL`, `INVENTORY_MASTER_SERVICE_TOKEN_SOURCE` and `INVENTORY_AUTH_SERVICE_TOKEN_SOURCE` are set. No resolved secrets were printed (inspection used an all-dummy env file).
  - Merged model inspected (dummy env): inventory user 1000:1000, read-only, cap_drop ALL, init, 0.2/256 MiB/pids 128, heap 160, no ports, networks `auth-inventory`, `inventory-db`, `inventory-master`, `inventory-web`, both secrets, depends on postgres healthy / job completed / master healthy / auth started; job on `inventory-db` only; postgres gained `inventory-db`; auth gained `auth-inventory` + secret; master gained `inventory-master` + secret; nginx gained `inventory-web` + depends_on inventory healthy; all new networks internal.
  - `nginx -t` with the pinned Nginx image in a throwaway `--network none --read-only` container (upstream names mapped to a closed loopback address): syntax ok. Probes: `/api/inventory/v1/load-to-stock`, `/api/inventory/v1/notifications/stream`, `/api/inventory/v1/%5Cx` and `?q=a\b` → proxied to `:3301` (502, closed upstream); `/api/inventory/v1\internal/x` and `/api/inventory/v1/load-to-stock/photos\x` → 400; `/internal/v1/x`, `/_storage/files/x` → 404; `/api/master/x` → `:3201` unchanged; `/nginx-healthz` 200.
- Not run (blocked on backend source, `.env`/secret files and parent bring-up): image build, non-root/read-only runtime, healthy start, job ordering, privilege queries for the three roles, secret access (presence + rejection of wrong token), SSE end-to-end through Nginx (first byte < 1 s, ping every 25 s, close/reconnect), photo upload 5 MB pass / > 6 MB 413, storage persistence across recreate, idle and 200-row RSS, host `free -m`.
- Findings: [INV-20261117-001](../../../../task/investigation/INV-20261117-001-inventory-hono-minimum-secure-versions.md) (backend version floor); base-image evidence added to [INV-20261110-005](../../../../task/investigation/INV-20261110-005-container-image-refresh-hardening.md). Corrective work: none.
