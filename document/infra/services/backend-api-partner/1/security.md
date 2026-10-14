# Container security: backend-api-partner / 1

## Selection and inventory

- **Service ID / infra revision / status:** `backend-api-partner` / 1 / **implemented — dev-verified**
  (approved 2026-10-14, D1–D4 recommended; Compose/env applied by BE-CUS-011, see
  [Implementation record](#implementation-record-be-cus-011-2026-10-14)). Production rollout
  (backup, `f1_partner` bootstrap, host secrets) **not done** and not authorized.
- **Parent task / ADR / authorization:** feature `customer`;
  [ADR-0018](../../../../adr/0018-customer-master-partner-service.md) revision 1, Accepted
  2026-10-14, owner instruction "อนุมัติ ADR-0018". ADR sha256
  `a967fe7dc7bcf94d392164bb45ff0a7536db532b94d21c7c8d35f2ce14b05424`. The ADR approves the
  container, its `PARTNER_*` variables, port 3201, 0.35 vCPU / 512 MB and "no published port in
  production"; it explicitly defers network, non-root, secret and DB-role detail to this bundle,
  which the owner must review **before** any Compose/Dockerfile/env change.
- **Input hashes (sha256, 2026-10-14, branch `feat/14-10-26-customer`):**
  `backend-api-auth/Dockerfile`
  `3e1c967b945b5e57acfffb1d4b96910bb159578f1b723fda7504d5c6d1e7e61b`;
  `backend-api-gateway/Dockerfile` `30cc0d9d7304013b7a72231550ec175cf7fd140cf5bb98d0f458742d23cab7c9`;
  `frontend/Dockerfile` `d440722ad3d1fd34f258cab7f1a5d8d99449a6ec18ad87948316db2192bdd39d`;
  `.dockerignore` `7c4062aefd180d4575c3b8129f3210edd1cd8abb0dbf48d99ff3baef18f7a423`;
  `.env.example` `1ced0b6bb2dec0523837c7e3c423dc5830f1da2ca206fe5d7cff722dbeaea120`;
  `pnpm-workspace.yaml` `a8205bc2f5857669d0d649de8abe7d3ac788641f14f747446df67cac390eff90`.
  Full compose hashes: `4f898ce5080f30894b1f836dd3022c4d5462158bd69c8ae482745323aae123aa`,
  `368a9da0e830a268a7749199dd42a2eef37b6949e53d88477459802d8765312c`; dev Dockerfile
  `8b052e37e731524333ec324bcfd0f0d8b88bfa8b3ac867afb8ecc42b16529fb3`.
- **Engine/Compose/platform:** local workstation Docker Engine 29.8.0 / Compose v5.5.1 on
  Windows 11 (Docker Desktop). **Production host Engine/Compose/kernel/LSM/firewall versions are
  unknown** — must be recorded before rollout. Target arch assumed linux/amd64 (unverified).
- **Image provenance:** proposed base `node:24.11.0-bookworm-slim` (Docker Official Image), same
  pin as auth/gateway/frontend/dev. No digest pinned in the repo today. Node.js `index.json`
  (accessed 2026-10-14) lists v24.21.0 (2026-09-07) as latest 24.x LTS "Krypton" and v24.18.1
  (2026-07-28) flagged as a security release; Node security releases also occurred in
  Mar/Jun/Jul 2026. **24.11.0 is therefore missing several security releases** (affects all
  four existing images too; see "Out-of-scope observations"). PostgreSQL 18.6 is the current
  18.x minor per postgresql.org (accessed 2026-10-14).
- **Compose files in order:** `docker-compose.yml` (base, also used as production baseline —
  no separate production file exists) then `docker-compose.dev.yml` (local watch). No
  profiles, replicas = 1, no helper/init job proposed (migrations run at container start like
  auth; see decision D2).
- **Research date / review-by:** 2026-10-14 / **2027-01-14** (3 months: Node.js ships security
  releases roughly quarterly or faster and Prisma 7 minors are frequent).
  **Invalidating triggers:** any change of Node base tag/digest, Prisma (`prisma`,
  `@prisma/client`, `@prisma/adapter-pg`) or `pg` versions, PostgreSQL image tag, production
  Engine/Compose/host OS; a Node/Prisma/PostgreSQL/Docker security advisory; ADR-0018 revision
  change; change of token/secret interface, network topology, storage, port, or capacity; a
  production compose file being introduced.
- **Fresh advisory/image-support check for rollout:** not yet done (no rollout selected).
  Must be repeated at implementation time; see D1 about the Node patch level.

## Official research and control decisions

| Setting/control | Official source and applicable version | Current/desired value | Reason | Required exception/compatibility evidence | Implementation owner |
|---|---|---|---|---|---|
| Runtime user | [docker-node Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md) — `node` user uid 1000 in official node images | `USER 1000:1000` in `backend-api-partner/Dockerfile` (prod). Dev image stays root (existing dev exception) | Process cannot modify root-owned app files/`node_modules` | App/build artifacts are created as root during build and only need read access; verify `id` = 1000 and app start | infra (Dockerfile) |
| Start command without pnpm | docker-node Best Practices (PID 1); corepack downloads pnpm lazily into the user's cache | `CMD ["sh","-c","./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]`, `WORKDIR /app/backend-api-partner` | `pnpm` shim (corepack) has no cached binary for uid 1000 and would try to download it — fails with read-only root and no egress | Verify container starts with no network egress | infra |
| PID 1 / signals | docker-node Best Practices ("Node.js was not designed to run as PID 1"); [Compose `init`](https://docs.docker.com/reference/compose-file/services/) | `init: true` and `exec node` | Graceful SIGTERM shutdown (Nest `enableShutdownHooks`) and zombie reaping of healthcheck processes | Verify `docker compose stop` exits < grace period | infra |
| Capabilities | [Docker Engine security](https://docs.docker.com/engine/security/) | `cap_drop: [ALL]`, none added | Listens on 3201 (>1024), no raw sockets, no chown | Dev override resets it (root watch process on bind mount) | infra |
| no-new-privileges | Compose `security_opt` | `no-new-privileges:true` | No setuid need | none | infra |
| Seccomp / LSM | [Docker seccomp](https://docs.docker.com/engine/security/seccomp/) | Keep Docker default profile; host AppArmor/SELinux = unknown | Never disable to fix startup | Record host LSM facts before rollout | infra (host facts: owner/ops) |
| Read-only root | Compose `read_only`, `tmpfs` | `read_only: true`; `tmpfs: /tmp:size=16m,mode=1777,noexec,nosuid,nodev` | Runtime writes nothing to image FS: logs to stdout (pino), Prisma 7 client with `adapter-pg` (no runtime engine download), no uploads | **Unverified:** Prisma CLI loading `prisma.config.ts` during `migrate deploy` may write a transpile cache; the schema-engine binary must execute from read-only `node_modules`. Check P5 below. Fallback if it fails: keep `read_only` and add a bounded tmpfs at the reported path, or move migration to a helper job (D2) — not drop read-only silently | infra / backend (config file) |
| PIDs | Compose `pids_limit` | `128` | Bounds fork bombs; Node ≈ 10–20 threads + healthcheck node process | Measure | infra |
| CPU/RAM | ADR-0018 capacity | `deploy.resources.limits` 0.35 CPU / 512M; `NODE_OPTIONS=--max-old-space-size=320` | Keep V8 heap below the cgroup limit, leaving room for buffers and the healthcheck `node` process (inherits env) | Measure RSS under list/create load before production (ADR requirement) | infra |
| Logs | [json-file driver](https://docs.docker.com/engine/logging/drivers/json-file/): `max-size` default -1 (unlimited) | `json-file`, `max-size: 10m`, `max-file: 3` (≤ 30 MB) | Bound disk growth | Other services have no rotation today (out of scope) | infra |
| Secrets | [Compose services `secrets`](https://docs.docker.com/reference/compose-file/services/): file secrets are bind-mounted at `/run/secrets/<target>`; `uid/gid/mode` "silently ignored" for file sources | Rev 1: environment variables interpolated from a host `.env` outside git (mode 600). Optional `*_FILE` reader prepared by backend (D3) | Matches the existing auth/gateway mechanism; Compose file secrets need an app reader **and** host file readable by uid 1000 because mode/uid cannot be set | If D3 = file secrets, host file must be `0440` with group readable by gid 1000 or owned by 1000 | backend (reader), infra (Compose), owner/ops (host file) |
| Network isolation | [Compose networks `internal`](https://docs.docker.com/reference/compose-file/networks/); [`docker network create --internal`](https://docs.docker.com/reference/cli/docker/network/create/): containers "may communicate between each other, but not with any other network"; host can still reach container IPs | Two internal networks (see communication table), no published port | Only gateway can reach partner; partner reaches only postgres; no internet egress (ADR: none needed) | Shared bridge is not per-port ACL; host processes on Linux can still reach container IPs | infra |
| Published ports | [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/) | none (base and dev) | ADR: production must not publish | Dev debugging goes through gateway | infra |
| App authentication | ADR-0018 §1 | `PARTNER_SERVICE_TOKEN` ≥ 32 chars on every `/internal/v1/*` request; 401 otherwise | Defense in depth on top of network isolation | Constant-time compare; never logged | backend |
| TLS gateway→partner | — | none (plain HTTP on isolated internal bridge) | Same host, internal network; matches gateway→auth | Accepted exception; revisit if services leave a single host | — |
| DB auth | [Postgres image docs](https://github.com/docker-library/docs/blob/master/postgres/README.md): host auth `scram-sha-256` on PG14+ unless `POSTGRES_HOST_AUTH_METHOD` set; [PG18 password auth](https://www.postgresql.org/docs/18/auth-password.html) | Keep scram; new role `f1_partner` in production | Least privilege | No `trust`; `pg_hba` per-role network restriction not proposed (needs fixed subnets) | owner/DB admin (bootstrap), backend (migration) |
| Image/build context | [Docker build best practices](https://docs.docker.com/build/building/best-practices/) | Follow auth pattern (single stage, whole workspace via `.dockerignore`); `.dockerignore` already excludes `.env*`, `document`, `**/src/generated/prisma` | Consistency with existing CI matrix | Multi-stage/`pnpm deploy` slimming = later hardening, not in rev 1 | infra / devops |
| Host/socket access | Docker Engine security | No Docker socket, host mounts, devices, privileged or host namespaces | — | none | infra |
| Backups | Postgres image docs (init only on empty data dir) | `pg_dump` of `f1_system` before first partner migration in production | Rollback safety | Backup storage location = owner/ops | owner/ops |

## Required and prohibited communication

Current code paths confirmed 2026-10-14: frontend server → gateway (`GATEWAY_URL`) and → auth
(`AUTH_SERVICE_URL`); gateway → auth (`AUTH_SERVICE_URL`, `/health/ready`, proxied routes);
auth → postgres. Proposed additions only:

| Caller | Callee/DNS | Container port/protocol | Network(s) / published host bind | Authentication/TLS | Required egress/readiness | Positive/negative acceptance |
|---|---|---|---|---|---|---|
| backend-api-gateway | `backend-api-partner` | 3201/HTTP `/internal/v1/customers…` | `partner-api` (internal) / none | `PARTNER_SERVICE_TOKEN` header + actor user id; no TLS | timeouts 3 s read / 5 s write (ADR) | + `customer.list` via gateway succeeds; − request without/wrong token → 401 |
| backend-api-partner | `postgres` | 5432/TCP | `partner-db` (internal) / postgres keeps its existing `5432` publish via `default` | role `f1_partner` (prod) / `f1_user` (dev), scram | `/health/ready` runs a query with the partner role | + migration + ready; − `auth` schema access denied (prod role) |
| Docker healthcheck (in-container) | `127.0.0.1:3201/health/ready` | HTTP | loopback inside container | none (health endpoints exempt from token, return no data) | — | container becomes `healthy` |
| frontend, backend-api-auth | `backend-api-partner` | — | not on `partner-api` | — | — | − DNS lookup `backend-api-partner` fails (ENOTFOUND) |
| Browser / host / LAN | partner | — | no published port | — | — | − `localhost:3201` refused on host; on Linux the host itself can still reach the container IP (documented limit) |
| backend-api-partner | internet, auth, frontend | — | no non-internal network | — | none required (ADR) | − outbound fetch to external host fails; − `backend-api-auth` not resolvable |
| Browser | partner data | via frontend → gateway tRPC `customer.*` only | existing gateway ingress | session + `permittedProcedure` | — | covered by ADR acceptance 1–9 |

**Network design (recommended, D4):**

- `partner-api` (`internal: true`): members `backend-api-gateway`, `backend-api-partner`.
- `partner-db` (`internal: true`): members `backend-api-partner`, `postgres`.
- `default`: unchanged membership (postgres, auth, gateway, frontend). Once a service lists
  `networks:` it is no longer attached to `default` implicitly, so **postgres and gateway must
  list `default` explicitly**.

Compatibility impact: auth and frontend are untouched. `postgres` and `backend-api-gateway`
get an extra network, which requires recreating both containers (data volume preserved;
brief login/API outage while postgres restarts). Postgres host port 5432 keeps working because
it stays on `default`. Embedded DNS works on internal user-defined networks.

Minimal alternative (D4-b): put partner on `default` only. No postgres/gateway recreation, but
frontend and auth can then reach partner:3201 (token still enforced) and partner gets internet
egress. Not recommended.

## Storage, init and data protection

- **Writable paths:** production: only `/tmp` tmpfs 16 MiB (counted against the 512M limit);
  no volumes. Dev: bind mount `.:/app` plus named volumes (below).
- **Existing data vs clean init:** `postgres-data` is an existing volume (PG18 layout,
  mounted at `/var/lib/postgresql`). `/docker-entrypoint-initdb.d` scripts and `POSTGRES_*`
  variables do **not** run on it. The `partner` role/schema must therefore be bootstrapped
  manually (production) — no init script is proposed. A fresh PG18 cluster has no `CREATE` on
  schema `public` for `PUBLIC` ([PG18 schemas §5.10](https://www.postgresql.org/docs/18/ddl-schemas.html));
  the check plan confirms this on the real volume.
- **Secret reader:** none exists today (all services read plain env). If D3 chooses file
  secrets, backend adds `PARTNER_SERVICE_TOKEN_FILE` / `PARTNER_DATABASE_URL_FILE` readers in
  both partner and gateway (file wins over env; trim trailing newline; never log).
- **Roles:**
  - **Dev:** keeps existing superuser `f1_user` (owner-accepted dev exception, matches auth).
  - **Production:** `f1_partner` — LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION,
    NOBYPASSRLS, `CONNECTION LIMIT 8` (pool 5 + migrate + admin margin); owns schema `partner`
    only; `CONNECT` on `f1_system`; no privileges on `auth` or `public` (CREATE). Used by both
    `migrate deploy` and the runtime (D2 option a). The superuser `f1_user` is used only by an
    authorized DB admin for the one-time bootstrap.
  - `_prisma_migrations` for partner lives in schema `partner` via `?schema=partner` in the URL
    (auth's history is in `public`; they stay separate as ADR requires).
- **Bootstrap procedure (production, one time, needs explicit DB-admin authorization):**
  1. `pg_dump` backup of `f1_system` to the owner's backup location; record checksum.
  2. `docker compose exec postgres psql -U f1_user -d f1_system` (local socket; no password on
     the command line), then:

     ```sql
     CREATE ROLE f1_partner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
       CONNECTION LIMIT 8;
     \password f1_partner
     CREATE SCHEMA IF NOT EXISTS partner AUTHORIZATION f1_partner;
     ALTER SCHEMA partner OWNER TO f1_partner;
     GRANT CONNECT ON DATABASE f1_system TO f1_partner;
     ALTER ROLE f1_partner IN DATABASE f1_system SET search_path = partner;
     -- verification (expect f, f, f, t)
     SELECT has_schema_privilege('f1_partner','auth','USAGE'),
            has_database_privilege('f1_partner','f1_system','CREATE'),
            has_schema_privilege('f1_partner','public','CREATE'),
            has_schema_privilege('f1_partner','partner','CREATE');
     ```

     `\password` sends a client-side SCRAM hash, so the plaintext is not written to server
     logs. Generate the password with ≥ 32 random characters; URL-encode it in
     `PARTNER_DATABASE_URL`.
  3. Write `PARTNER_CONTAINER_DATABASE_URL=postgresql://f1_partner:<encoded>@postgres:5432/f1_system?schema=partner`
     and `PARTNER_SERVICE_TOKEN=<≥32 random>` into the production host `.env` (outside git,
     mode 600, owner = deploy user). Never echo them in shell history/CI logs.
- **Unverified migration risk:** [CREATE SCHEMA](https://www.postgresql.org/docs/18/sql-createschema.html)
  requires `CREATE` on the database; the docs do not state whether `IF NOT EXISTS` skips that
  check when the schema already exists. auth's initial migration starts with
  `CREATE SCHEMA IF NOT EXISTS "auth"`, so partner's generated migration likely will too.
  Backend must test `migrate deploy` as `f1_partner` (no database CREATE) against a scratch
  PG 18.6 DB. If denied: preferred fix is a one-time `GRANT CREATE ON DATABASE f1_system TO
  f1_partner` during the first deploy followed by `REVOKE` (documented in the rollout), not a
  permanent grant.
- **Rotation:** token: set new value in host `.env`, recreate gateway and partner together
  (brief 401/502 window; dual-token acceptance is out of scope for rev 1). DB password:
  `\password f1_partner`, update `.env`, recreate partner. Both need explicit authorization.
- **Rollback:** see Rollout.
- **Dev exceptions:** root dev image, bind mount + watch, `read_only`/`cap_drop`/`tmpfs`
  reset in the dev override, superuser DB role. Production differences are the hardened
  base values above.

## Capacity

- **Service:** 0.35 vCPU / 512 MiB, heap cap 320 MiB, pids 128, `/tmp` 16 MiB, logs ≤ 30 MiB,
  Prisma/pg pool `max: 5` (backend sets it on `PrismaPg`; URL `connection_limit` is not
  documented as honored by the adapter), `connectionTimeoutMillis` finite (suggest 5 000 ms;
  node-postgres default 0 = wait forever), `idleTimeoutMillis` default 10 000. Request body
  ≤ 256 KB (ADR).
- **Aggregate merged limits (base):** postgres 1.25 / 2048 MiB, auth 0.5 / 1024, gateway
  0.5 / 768, frontend 0.6 / 1280, partner 0.35 / 512 → **3.20 vCPU / 5632 MiB (5.5 GiB)**.
  No replicas or concurrent init job (migration runs inside the partner container).
- **Headroom on 8 GiB / 4 vCPU:** 0.80 vCPU / 2560 MiB for OS, Docker daemon, build cache
  activity and page cache. Image builds on the production host would compete; build in CI.
- **DB connections:** auth pg pool default max 10 + partner 5 + migration 1 + admin ≈ 17,
  well below PostgreSQL default `max_connections` 100.
- **Unresolved measurements:** partner RSS/CPU under list (50 rows) and create (20 addresses)
  load; startup peak during `migrate deploy`; healthcheck overhead (spawns `node` every 30 s).

## Exact proposed configuration (not applied)

### `docker-compose.yml` — add service, extend gateway/postgres, add networks

```yaml
  postgres:
    # ...existing keys unchanged...
    networks:
      - default
      - partner-db

  backend-api-gateway:
    # ...existing keys unchanged...
    environment:
      # existing NODE_ENV, PORT, AUTH_SERVICE_URL, CRM_API_KEY unchanged
      PARTNER_SERVICE_URL: http://backend-api-partner:3201
      PARTNER_SERVICE_TOKEN: ${PARTNER_SERVICE_TOKEN:?PARTNER_SERVICE_TOKEN must be set (see .env.example)}
    depends_on:
      backend-api-auth:
        condition: service_started
      backend-api-partner:
        condition: service_started
    networks:
      - default
      - partner-api

  backend-api-partner:
    build:
      context: .
      dockerfile: backend-api-partner/Dockerfile
    restart: unless-stopped
    init: true
    read_only: true
    tmpfs:
      - /tmp:size=16m,mode=1777,noexec,nosuid,nodev
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 128
    deploy:
      resources:
        limits:
          cpus: "0.35"
          memory: 512M
    environment:
      NODE_ENV: production
      PORT: 3201
      NODE_OPTIONS: --max-old-space-size=320
      CHECKPOINT_DISABLE: "1"
      PRISMA_HIDE_UPDATE_MESSAGE: "1"
      PARTNER_DATABASE_URL: ${PARTNER_CONTAINER_DATABASE_URL:-postgresql://f1_user:f1_dev_password@postgres:5432/f1_system?schema=partner}
      PARTNER_SERVICE_TOKEN: ${PARTNER_SERVICE_TOKEN:?PARTNER_SERVICE_TOKEN must be set (see .env.example)}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - partner-api
      - partner-db
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3201/health/ready',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
      start_interval: 5s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # no ports: — must not be published (ADR-0018)

networks:
  partner-api:
    internal: true
  partner-db:
    internal: true
```

Notes: the DB URL is interpolated from **`PARTNER_CONTAINER_DATABASE_URL`**, not
`PARTNER_DATABASE_URL`, because `.env` is also read by host-run `pnpm dev` with a
`127.0.0.1` URL; reusing the same name would inject a host-only URL into the container
(auth avoids this by hard-coding its container URL). The `:?` form for the token makes a
missing token fail fast instead of silently using a known default (D3). No healthcheck tool
(`curl`/`wget`) exists in `bookworm-slim`, hence `node -e fetch`. `start_interval` requires
Compose ≥ 2.20.2 / a supporting Engine — verify on the production host or drop the key.

### `docker-compose.dev.yml` — add service and volumes

```yaml
x-dev-volumes: &dev-volumes
  # ...existing entries unchanged...
  - dev-partner-node-modules:/app/backend-api-partner/node_modules
  - dev-partner-prisma:/app/backend-api-partner/src/generated/prisma

services:
  backend-api-partner:
    image: f1-system-dev:local
    build: *dev-build
    command: ["sh", "-c", "pnpm --filter @gem-crm/backend-api-partner db:generate && pnpm --filter @gem-crm/backend-api-partner db:migrate && exec pnpm --filter @gem-crm/backend-api-partner dev"]
    environment:
      NODE_ENV: development
      NODE_OPTIONS: ""
    read_only: false
    cap_drop: !reset []
    tmpfs: !reset []
    volumes: *dev-volumes

volumes:
  # ...existing entries unchanged...
  dev-partner-node-modules:
  dev-partner-prisma:
```

Dev keeps the internal networks (no egress for partner). Dev memory stays 512M; if
`nest start --watch` OOMs (exit 137), a dev-only override `deploy.resources.limits.memory:
768M` is the documented fallback — record the observation first.

### `backend-api-partner/Dockerfile` (new)

```dockerfile
FROM node:24.11.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend-api-gateway/package.json backend-api-gateway/package.json
COPY backend-api-auth/package.json backend-api-auth/package.json
COPY backend-api-partner/package.json backend-api-partner/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gem-crm/backend-api-partner db:generate
RUN pnpm --filter @gem-crm/backend-api-partner build
WORKDIR /app/backend-api-partner
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
# uid/gid 1000 = "node" user of the official image
USER 1000:1000
EXPOSE 3201
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
```

`openssl` is kept because the Prisma schema engine used by `migrate deploy` links it (same
as auth). Base tag follows the existing pin; see D1.

### Existing Dockerfiles — one line each

Add `COPY backend-api-partner/package.json backend-api-partner/package.json` after the auth
`package.json` COPY in `backend-api-auth/Dockerfile`, `backend-api-gateway/Dockerfile`,
`frontend/Dockerfile` and `docker/dev.Dockerfile`, so `pnpm install --frozen-lockfile`
sees every workspace importer in the lockfile (expected failure otherwise — confirm with a
build). In `docker/dev.Dockerfile` also add after the auth generate line:

```dockerfile
RUN pnpm --filter @gem-crm/backend-api-partner db:generate
```

`.dockerignore` needs no change (`**/src/generated/prisma`, `.env*` already excluded).

### `.env.example` — append

```dotenv
# backend-api-partner (ADR-0018). Host-run dev uses 127.0.0.1; Compose uses the CONTAINER URL.
# Dev reuses the existing local role; production uses the restricted f1_partner role.
PARTNER_DATABASE_URL=postgresql://f1_user:f1_dev_password@127.0.0.1:5432/f1_system?schema=partner
PARTNER_CONTAINER_DATABASE_URL=postgresql://f1_user:f1_dev_password@postgres:5432/f1_system?schema=partner
PARTNER_SERVICE_URL=http://localhost:3201
PARTNER_SERVICE_INTERNAL_URL=http://backend-api-partner:3201
# Generate a unique random value (>= 32 chars) for every deployment; gateway and partner share it.
PARTNER_SERVICE_TOKEN=local-development-partner-token-change-before-deploy-0000
```

## Backend / SA requirements (application source, not infra)

1. `GET /health/live` (no DB) and `GET /health/ready` that executes a real query **as the
   partner role** against schema `partner` (e.g. `SELECT 1 FROM partner."_prisma_migrations"
   LIMIT 1`), 503 on failure; both exempt from the token, return only status.
2. Token guard on `/internal/v1/*`: constant-time comparison (`crypto.timingSafeEqual` on
   equal-length digests), 401 without detail; in `NODE_ENV=production` refuse to start if the
   token is < 32 chars or equals the `.env.example` value. Actor user id header trusted only
   after the token check. Redact the token header and DB URL in pino (`redact`).
3. `new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000 }, { schema: "partner" })`
   ([Prisma PostgreSQL docs](https://www.prisma.io/docs/orm/overview/databases/postgresql)
   document the `{ schema }` second argument); `prisma.config.ts` reads `PARTNER_DATABASE_URL`
   and must not fall back to a hard-coded credential in production.
4. Optional production guard (recommended): at readiness, `SELECT rolsuper FROM pg_roles
   WHERE rolname = current_user`; fail readiness in production if true (detects forgotten
   override that would run as the dev superuser).
5. Listen on `0.0.0.0:3201` (container-internal reachability); `express.json({ limit: "256kb" })`.
6. Verify `prisma migrate deploy` as a non-superuser without database `CREATE` (see
   unverified migration risk) and that it runs with a read-only root filesystem as uid 1000.
7. If D3 = files: `*_FILE` readers in partner **and** gateway.
8. Gateway: `PARTNER_UNAVAILABLE` mapping; recommendation — do **not** add partner to
   gateway `/health/ready`, so a partner failure cannot take login down (ADR acceptance 10).

DevOps (via parent): add `backend-api-partner` to CI and the service-images matrix
(`backend-api-partner/Dockerfile`, package `@gem-crm/backend-api-partner`, linux/amd64),
runtime contract: uid 1000, read-only root, port 3201, readiness `/health/ready`, required
runtime vars `PARTNER_DATABASE_URL`/`PARTNER_SERVICE_TOKEN` (never build args). The four
existing Dockerfiles change too, so all images rebuild.

## Rollout and verification

- **Claimed paths when approved (parent assigns one writer):** infra — `docker-compose.yml`,
  `docker-compose.dev.yml`, `backend-api-partner/Dockerfile`, the one-line edits to the three
  existing Dockerfiles and `docker/dev.Dockerfile`, `.env.example`. backend —
  `backend-api-partner/**` source, Prisma schema/migrations, gateway adapter. devops —
  `.github/**`. Parent — `document/infra/service-index.md`, `document/devops/service-index.md`,
  `pnpm-lock.yaml`/`pnpm-workspace.yaml` if touched.
- **Order:** backend package + lockfile exist first (Dockerfile COPY lines fail otherwise) →
  infra config → dev verification → devops pipeline → production bootstrap + deploy.
- **Deployment authorization boundary:** this bundle authorizes nothing live. Production
  backup, role bootstrap, host `.env` secrets, and recreating postgres/gateway each need the
  owner's explicit deployment instruction and a maintenance window.
- **Production rollout:** (1) refresh advisory/image check; (2) backup; (3) bootstrap role/
  schema; (4) host `.env` values; (5) `docker compose up -d` (recreates postgres, gateway,
  creates partner); (6) run checks below.
- **Rollback:** frontend hides route/tab (ADR); remove partner service, its env on gateway, the
  extra networks on gateway/postgres; recreate gateway/postgres. Schema `partner` and role
  remain (no data destruction); dropping them later needs separate authorization. Auth data is
  unaffected (separate schema). Restore from the step-2 backup only for corruption.

### Static checks (no secrets printed)

- S1 `docker compose -f docker-compose.yml config --quiet` and with `-f docker-compose.dev.yml`
  (exit 0). Compose validation is not runtime proof.
- S2 `docker compose ... config --services` includes `backend-api-partner`.
- S3 From `config --format json`, extract only partner `ports` (must be absent), `networks`,
  `read_only`, `cap_drop`, `user`-related keys and postgres/gateway `networks`; never print
  `environment`.
- S4 Dev merge shows `read_only: false`, empty `cap_drop`/`tmpfs` (the `!reset` tags applied).

### Runtime checks (only when authorized; deadline 60 s each, 30 min total)

- P1 partner `healthy`; `docker inspect` → User `1000:1000`, ReadonlyRootfs true, CapDrop ALL,
  SecurityOpt no-new-privileges, PidsLimit 128, Memory 512 MiB, NanoCpus 0.35e9, LogConfig.
- P2 `docker compose exec backend-api-partner id` → uid 1000; `touch /app/x` → EROFS.
- P3 gateway → partner: authorized `customer.list` / `customer.create` via gateway succeed.
- P4 partner → postgres: `partner._prisma_migrations` populated; readiness 200.
- P5 cold start with read-only root and no egress completes `migrate deploy` (watch for
  EROFS/ENOENT in logs).
- P6 login, user-permission, license still work (ADR acceptance 10).
- N1 from gateway container: request to `/internal/v1/customers` without token and with a
  wrong token → 401.
- N2 from frontend and auth containers: `node -e "require('dns').lookup('backend-api-partner',e=>process.exit(e?0:1))"` → exit 0 (not resolvable).
- N3 host: TCP connect to `localhost:3201` refused.
- N4 from partner: `fetch('https://example.com')` fails; `backend-api-auth` not resolvable.
- N5 as `f1_partner` (production/staging): `SELECT 1 FROM auth."User"` → permission denied;
  `CREATE SCHEMA x` → denied; `CREATE TABLE public.x(i int)` → denied.
- C1 `docker stats` peak memory/CPU of partner under list/create load recorded (ADR).

### Checks actually performed

- Static file reading and hashing only. **No** Compose validation of the proposed snippets
  (they are not applied), no build, no container started/stopped, no DB access. Status remains
  `pending-review`; nothing is verified.

### Not verified / research gaps

- Whether Prisma 7.10 `migrate deploy` (a) needs database `CREATE` when the schema exists, (b)
  writes any cache when loading `prisma.config.ts` on a read-only FS, (c) auto-creates the
  `?schema=` schema. Official Prisma docs consulted did not state these.
- Whether `@prisma/adapter-pg` 7.10 honors URL `schema`/`connection_limit` (docs only show the
  explicit `{ schema }` argument) — the requirement uses explicit options.
- `CHECKPOINT_DISABLE` (Prisma CLI update/telemetry check) is not listed on the current Prisma
  env-var reference page; it is harmless if ignored because partner has no egress anyway.
  `PRISMA_HIDE_UPDATE_MESSAGE` is documented.
- D3 (a) uses `:?` for the token in the base file: existing local `.env` files without
  `PARTNER_SERVICE_TOKEN` will make every `docker compose` command fail until the value is
  copied from `.env.example` — intended fail-fast, but a dev-workflow change.
- Docker docs for internal networks do not describe port publishing on internal-only
  networks; the design avoids depending on it (partner publishes nothing).
- Production host Engine/Compose/kernel/LSM/firewall; whether `start_interval` is supported
  there; `pnpm install --frozen-lockfile` behavior with a missing workspace `package.json`
  (assumed failure, hence the COPY lines).
- Exact Node 24.x security-fix contents between 24.11.0 and 24.21.0 were not enumerated.

- **Findings/exception links:** none filed by this bundle (see observations below).
- **Corrective ledger:** not applicable (design work, no corrective pass allocated).
- **Approval evidence for material changes:** approved 2026-10-14 (D1–D4 recommended); see Implementation record.

## Implementation record (BE-CUS-011, 2026-10-14)

- **Authorization:** owner 2026-10-14T11:45+07:00 "อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ ..." —
  D1 keep `node:24.11.0`; D2 `f1_partner` + migrate at start in production (dev keeps `f1_user`;
  production bootstrap **not run**); D3 env secrets with `:?` fail-fast; D4 two internal networks,
  one-time recreation of postgres and gateway accepted. Parent assigned infra as sole writer.
- **Applied (sha256 after change):** `docker-compose.yml`
  `8408246a2f9404975d82e3a2a0129d1d0ff8a7caaa84e9a7d30a12187bfcc9bb`; `docker-compose.dev.yml`
  `8bc0e050bdb9dfcac6faa3c39edf54c523c7469a710814c8fcaed3b20a731daf`; `.env.example`
  `13dcc6643267ee765f33891ee1bf65c9ae427a4df461e9fb931e831a66b6d37f` (block above, token example
  byte-identical to backend's `EXAMPLE_SERVICE_TOKEN`); root `package.json`
  `5f1ea6a89010effa952bde5631eae715f296e0e55560f42c59f9e264a90f68b7` (`docker:dev:install` only);
  `.gitignore` `2f64f3236fb8b397ee771b6f0aa126fd2de7f2c2d3acdd41a35df75ea559fd91` and `.dockerignore`
  `091f84036bebba663dd932a8660a1bb954f96bf6cab1eeb3c18a7d06ade231bf` (`.pnpm-store`); local
  untracked `.env` gained the `PARTNER_*` variables with a generated 48-char token (value never
  printed). `backend-api-partner/Dockerfile` (`3f53c6ca…8cf`, backend-authored) and other
  Dockerfiles were not edited. ADR-0018 hash unchanged (`a967fe7d…5a05424`).
- **Deviation from the proposed snippet:** `pids_limit: 128` → `deploy.resources.limits.pids: 128`.
  Compose 5.5.1 rejects `pids_limit` together with `deploy.resources.limits` ("can't set distinct
  values on 'pids_limit' and 'deploy.resources.limits.pids'"). Same enforced value (`PidsLimit 128`
  observed). Everything else matches the snippet.
- **Dev-install incident and fix (corrective ledger `BE-CUS-011/dev-install`, pass 1 of 3):** the
  dev image predated partner, so infra ran `docker compose run --rm frontend pnpm install
  --frozen-lockfile` (the old `docker:dev:install` step). pnpm aborted (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`);
  the attempt resolved a store inside the bind-mounted repo (`/app/.pnpm-store`, ~47k files) and
  left the shared dev `node_modules` volumes half-installed, so app containers failed (partner
  restart count 21). Root cause: the one-off container had no `CI=true` (non-TTY purge refused) and
  no explicit `--store-dir`, so the store did not match the volume's `.modules.yaml`
  (`storeDir: /root/.local/share/pnpm/store/v10`). Parent recovered with `CI=true pnpm install
  --frozen-lockfile --prefer-offline --store-dir=/root/.local/share/pnpm/store`, deleted the repo
  store and ran `up -d`. Fix: `docker:dev:install` now runs `run --rm --no-deps -e CI=true frontend
  pnpm install --frozen-lockfile --store-dir=/root/.local/share/pnpm/store` and restarts
  `backend-api-partner` too; `.pnpm-store` is ignored by git and the Docker build context. The fixed
  script itself was **not executed** (parent instruction); no further pass used.
- **Runtime checks performed:** S1–S4, P1–P6, N2–N4, BT-CUS-12 and data preservation — all pass;
  results in [testing.md](../../../../apps/backend/partner/customer/testing.md#results--infra-be-cus-011-run-2026-10-14-branch-feat14-10-26-customer-local-dev-stack).
  P1/P2/P5 used a one-off base-only container on the real internal networks/DB (removed).
- **Not run / open:** N1 is BT-CUS-12 (pass); N5 and production bootstrap (needs `f1_partner`
  and DB-admin authorization); C1/BT-CUS-20 load; BT-CUS-21 fresh-volume concurrent migrations
  (would need a fresh volume); `start_interval` support on the production host; production host
  Engine/Compose/LSM facts; refreshed Node advisory check (D1 kept 24.11.0 knowingly).
- **Observation (not a change):** dev partner in watch mode uses ~400 MiB of its 512 MiB limit
  (not OOM-killed). If exit 137 appears, the documented dev-only fallback is a 768M dev limit —
  needs an observation first. The shared dev image `f1-system-dev:local` (built 2026-10-12)
  predates partner; dev works through the dependency volumes, and `pnpm docker:dev:build` would
  refresh it (not run, to avoid recreating services during parallel frontend work).
- **Capacity (base, unchanged from plan):** 3.20 vCPU / 5632 MiB of 4 / 8 GiB.

## Decisions needing owner input

- **D1 Node base patch:** keep `24.11.0` for consistency (recommended only together with a
  separate ticket to bump all images) or start partner and all images on the current 24.x LTS
  (24.21.0 at research time). Mixing versions is not recommended.
- **D2 Migration role/timing:** (a, recommended for rev 1) `f1_partner` owns schema and runs
  `migrate deploy` at container start, like auth; (b, stronger later) split DML-only runtime
  role plus a one-off migrate job — adds a helper container and SA review.
- **D3 Secrets:** (a, recommended) env from host `.env` with `:?` fail-fast for the token;
  (b) Compose file secrets — needs backend `*_FILE` readers in partner and gateway and host
  file permissions for uid 1000.
- **D4 Networks:** (a, recommended) two internal networks, recreating postgres and gateway once;
  (b) minimal `default`-only attachment (weaker isolation, partner has egress).

## Out-of-scope observations (not filed; parent may route to investigation, owner infra)

- All four existing images pin `node:24.11.0-bookworm-slim`, behind several Node 24 security
  releases (latest 24.21.0, security release 24.18.1 among them).
- Existing app containers run as root, have no `cap_drop`/`read_only`/log rotation; base
  Compose publishes postgres 5432, auth 3101, gateway 4000 on all interfaces and contains dev
  credentials; auth uses the bootstrap superuser `f1_user`.

## Sources (accessed 2026-10-14)

- Docker Compose services reference — https://docs.docker.com/reference/compose-file/services/
- Docker Compose networks reference — https://docs.docker.com/reference/compose-file/networks/
- `docker network create` (`--internal`) — https://docs.docker.com/reference/cli/docker/network/create/
- Docker bridge networks — https://docs.docker.com/engine/network/drivers/bridge/
- Docker Engine security / seccomp — https://docs.docker.com/engine/security/ , https://docs.docker.com/engine/security/seccomp/
- json-file logging driver — https://docs.docker.com/engine/logging/drivers/json-file/
- Docker Engine 28 networking hardening — https://www.docker.com/blog/docker-engine-28-hardening-container-networking-by-default/
- docker-node Best Practices — https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
- Node.js release index — https://nodejs.org/dist/index.json ; vulnerability blog https://nodejs.org/en/blog/vulnerability
- Official postgres image docs — https://github.com/docker-library/docs/blob/master/postgres/README.md
- PostgreSQL versioning — https://www.postgresql.org/support/versioning/
- PostgreSQL 18 CREATE SCHEMA — https://www.postgresql.org/docs/18/sql-createschema.html
- PostgreSQL 18 schemas/privileges — https://www.postgresql.org/docs/18/ddl-schemas.html
- PostgreSQL 18 password auth — https://www.postgresql.org/docs/18/auth-password.html
- Prisma PostgreSQL / adapter-pg — https://www.prisma.io/docs/orm/overview/databases/postgresql
- Prisma multi-schema — https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema
- Prisma environment variables — https://www.prisma.io/docs/orm/reference/environment-variables-reference
- node-postgres Pool — https://node-postgres.com/apis/pool

Implemented configuration is not verified deployment. Update the index with the exact
applied revision and evidence only after the stated checks are satisfied.
