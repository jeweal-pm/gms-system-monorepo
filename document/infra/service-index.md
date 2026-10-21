# Infrastructure service index

This explicit registry tracks infra research/configuration coverage; compare it with
actual merged Compose and ADR revisions on every relevant invocation. It is not a watcher.

Source inventory on 2026-10-11: `docker-compose.yml`, overridden for local watch mode by
`docker-compose.dev.yml`. The following are inventory entries, **not security approvals**.
No infrastructure review or container reconfiguration was performed while creating the role.

| Service | Source role/image | Environment coverage | ADR/source reference | Infra bundle/revision | Status | Applied config hash / checks / research date |
|---|---|---|---|---|---|---|
| postgres | PostgreSQL 18.6 Alpine | base + inherited dev | ADR-0001, ADR-0003; compose service postgres | none (network change from backend-api-partner/1) | not-reviewed | none for the service itself. 2026-10-14 BE-CUS-011: added to internal network `partner-db` (plus explicit `default`); recreated once, volume `postgres-data` kept, row counts unchanged |
| mailpit | Mailpit v1.29 | removed from base + dev 2026-10-12 | [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) revision 1 | none | removed | Compose service, `SMTP_*` env and auth `depends_on` removed; dev stack recreated with `--remove-orphans`, auth started without SMTP |
| backend-api-auth | Node 24.11.0 bookworm-slim / NestJS + Prisma; shared dev image in dev | base + dev override | ADR-0001, ADR-0006, ADR-0008; [user-photo.md](../apps/backend/auth/user-permission/user-photo.md) PH-10 (sha256 `5fa6f78f…02ec04`, owner "อนุมัติ PH" 2026-10-17 as relayed by parent) | [services/backend-api-auth/1/security.md](services/backend-api-auth/1/security.md) (2026-10-17: named volume `auth-storage` for user photos, approved scope only; rest of the container not reviewed) | storage implemented, unverified (static render only; production rollout not done; container not otherwise reviewed) | 2026-10-17 (full hashes in bundle): `docker-compose.yml` 3b3b1188, `backend-api-auth/Dockerfile` 145bc508; C1/C2 compose render pass, C3 git-ignore pass on Docker 29.8.2 / Compose 5.5.1; not run: S1-1 image ownership, S1-2 upload, S1-3 recreate persistence, S1-4 build context; runtime is root (INV-20261017-004), `.dockerignore` gap (INV-20261017-005); research 2026-10-17, review-by 2027-01-17 |
| backend-api-gateway | Node/NestJS HTTP gateway; shared dev image | base + dev override | ADR-0001, ADR-0007, ADR-0018 | none (partner wiring from backend-api-partner/1) | not-reviewed | none for the service itself. 2026-10-14 BE-CUS-011: `PARTNER_SERVICE_URL`, `PARTNER_SERVICE_TOKEN` (`:?` fail-fast), `depends_on` partner, network `partner-api` (plus explicit `default`); recreated once; gateway→partner verified |
| frontend | Node/Next.js; shared dev image | base + dev override | ADR-0004 Frontend | none | not-reviewed | none |
| backend-api-partner | Node 24.11.0 bookworm-slim / NestJS + Prisma 7.10 (adapter-pg); shared dev image in dev | base + dev override | [ADR-0018](../adr/0018-customer-master-partner-service.md) rev 1 (sha256 `a967fe7d…5a05424`); [ADR-0021](../adr/0021-company-profile-in-partner-service.md) (storage) | [services/backend-api-partner/1/security.md](services/backend-api-partner/1/security.md); [2](services/backend-api-partner/2/security.md) (2026-10-16: named volume `partner-storage` for the company logo, approved scope) | implemented, dev-verified (production rollout not done) | BE-CUS-011 2026-10-14 (full hashes in bundle): `docker-compose.yml` 8408246a, `docker-compose.dev.yml` 8bc0e050, `.env.example` 13dcc664; S1–S4, P1–P6, N2–N4, BT-CUS-12 pass on local Docker 29.8.0 / Compose 5.5.1; not run: N5 (`f1_partner`), C1 load, BT-CUS-21 fresh volume, production host facts; deviation `deploy.resources.limits.pids` instead of `pids_limit`; research 2026-10-14, review-by 2027-01-14 |

2026-10-19 capacity change ([ADR-0024](../adr/0024-production-host-4gb-2vcpu.md), owner-approved): host is now
4 GB RAM / 2 vCPU; CPU/memory limits and Node heap caps of all five services were reduced in
`docker-compose.yml` and dev-only limits added to `docker-compose.dev.yml` (table in [capacity.md](capacity.md)).
Only `docker compose config` was run; production-image runtime/load checks are pending, so the rows above keep
their status.

Add one row per real service and profile-specific helper/job; relate revisions rather
than overwriting history. New/missing rows, accepted ADR changes, image/platform updates,
or material Compose/network/storage drift trigger research through the parent.
Store exact ADR/content hashes and approval when real work is selected. Retain gaps and
`implemented-unverified` until required runtime checks are complete; do not infer success
from a rendered Compose file or an agent handoff.

The parent serializes writes to this shared index, integrating scoped service-bundle
updates from infra. Exact ADR file paths/content hashes are authoritative when legacy
heading IDs disagree. For a researched row retain its review-by date and invalidation
triggers; advisory/image-support evidence is refreshed before each new rollout/setup.

## GMS target migration (approved design, research only)

The [GMS target infra bundle revision 1](services/gms-target/1/security.md) researches the
proposed Nginx, domain APIs, Redis/worker, database and storage profiles together.
SA revision 1 was approved for nonblocked work on 2026-10-20; no target Compose or image has been
configured, started or deployed. The `db-local + fs` design assumption is not a customer
profile selection. Exact target image tags/digests, CPU allocation, production measurements,
auth/license contract and migration approval remain pending. Research date: 2026-10-20;
review-by: 2026-11-20 for the Nginx candidate, or sooner on an image, host, advisory, service contract or profile
change. Existing service rows above remain the current inventory until an approved cutover.

## Local GMS ingress preview (stage A)

`docker-compose.gms.dev.yml` and `docker/nginx/gms-dev.conf` add the approved local-only
ingress preview on `127.0.0.1:8080`, using the researched Nginx unprivileged image pinned
to the Linux/amd64 manifest. It routes `/api/auth/*` directly to the current auth service,
keeps remaining app traffic through Next.js for rollback/parity, and rejects `/internal/*`
and `/_storage/*`; it does not claim master route cutover. Verified 2026-10-21: merged
Compose config valid, `nginx -t` passed, Nginx health 200, `/login` 200 (1.03 seconds after
the initial compile), `/api/auth/get-session` 200, existing `system.health` tRPC 200,
`/internal/v1/customers` 404; Postgres and partner are healthy.
The full-stack preview runs on the development workstation with watch-mode limits and is
not measured against the production 4 GB/2 vCPU host. Stage B/C service replacement and
production profile/capacity remain open in GP-AUTH/GP-MASTER/GP-INF/GP-CUT.
