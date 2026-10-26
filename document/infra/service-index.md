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
| backend-api-auth | Node 24.22.1 bookworm-slim (base bumped 2026-10-26) / NestJS + Prisma; shared dev image in dev | base + dev override | ADR-0001, ADR-0006, ADR-0008; [user-photo.md](../apps/backend/auth/user-permission/user-photo.md) PH-10 (sha256 `5fa6f78f…02ec04`, owner "อนุมัติ PH" 2026-10-17 as relayed by parent) | [services/backend-api-auth/1/security.md](services/backend-api-auth/1/security.md) (2026-10-17: named volume `auth-storage` for user photos, approved scope only; rest of the container not reviewed) | storage implemented, unverified (static render only; production rollout not done; container not otherwise reviewed) | 2026-10-17 (full hashes in bundle): `docker-compose.yml` 3b3b1188, `backend-api-auth/Dockerfile` 145bc508; C1/C2 compose render pass, C3 git-ignore pass on Docker 29.8.2 / Compose 5.5.1; not run: S1-1 image ownership, S1-2 upload, S1-3 recreate persistence, S1-4 build context; runtime is root (INV-20261017-004), `.dockerignore` gap (INV-20261017-005); research 2026-10-17, review-by 2027-01-17 |
| backend-api-gateway | Node/NestJS HTTP gateway; shared dev image | base + dev override | ADR-0001, ADR-0007, ADR-0018; GMS migration compatibility caller | legacy partner wiring bundle (historical); current URL resolves `api-master` | dev-verified, retained for rollback | `PARTNER_SERVICE_URL=http://api-master:3201`, `PARTNER_SERVICE_TOKEN` remains the legacy private API credential, depends_on `api-master`, network `partner-api`; gateway remains until route parity/zero-caller cutover gate |
| frontend | Node/Next.js; shared dev image | base + dev override | ADR-0004 Frontend | none | not-reviewed | none |
| api-master (`backend-api-master`) | Node 24.22.1 bookworm-slim (base bumped 2026-10-26) / NestJS + Prisma 7.10 (adapter-pg); shared dev image in dev | base + dev + GMS preview overlay | [ADR-0018](../adr/0018-customer-master-partner-service.md) historical ownership; [ADR-0025](../adr/0025-gms-domain-routing-and-trpc.md)/[ADR-0027](../adr/0027-gms-master-inventory-data-and-operations.md) target adaptation; schemas remain `partner`/`stone` | Historical hardening/storage records: [backend-api-partner/1](services/backend-api-partner/1/security.md), [2](services/backend-api-partner/2/security.md); current private boundary: [GMS master auth bundle](services/gms-master-auth-boundary/1/security.md); [GMS file storage rev 3](services/gms-file-storage/3/security.md) | renamed locally and runtime-verified 2026-10-21; local dev uses persistent host bind; production rollout/cutover not done | Compose/DNS service is `api-master`, package `@gem-crm/backend-api-master`, source `backend-api-master/`; current dev identity `f1-system-api-master-1`; dev bind `./storage` → `/app/backend-api-master/storage`, production target `/srv/gms/storage`; `partner-storage` is retained unchanged as legacy rollback/source. No schema/data migration. Existing backend-api-partner infra bundles are historical records, not current service identity. |

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

## GMS shared file storage

The [gms-file-storage infra bundles](services/gms-file-storage/) cover revision 1 mount
research, revision 2 retention for auth photos/logo, and revision 3 permanent retention for
all user-uploaded `files` and `public` assets. System-generated documents/exports keep
their distinct lifecycle. Upload cleanup is prohibited; cumulative disk growth is unbounded.
SA revision 3 and ADR-0029/0030 are approved for implementation. On 2026-10-21, the owner
authorized and infra completed a **local development** rollout of the new auth/partner
storage code. See [local rollout evidence](services/gms-file-storage/3/local-development-rollout.md)
and [completion report](../task/done/2026-10-21-gms-file-storage-local-rollout.md).
The existing named volumes remain mounted; the current partner logo is still served through
the legacy read fallback and has not been copied to the new object layout. A new upload was
not exercised. GF-06 through GF-08 remain open for bounded migration tooling, production
storage path/disk/admission/backup controls, and data migration/cutover. No Linux production
host/version, disk budget, backup target or recovery objective has been selected. This local
rollout does not verify production capacity or deployment. Research checked 2026-10-21;
review by 2026-11-20 or sooner on an engine/Compose/host/path/profile change or security
advisory.

## GMS master-auth adapter status (2026-10-21)

The approved master-auth adapter is mounted in the renamed `api-master` process and verified
in the scoped local development overlay. Its workspace source is `backend-api-master`, and
the local container is `f1-system-api-master-1`. This naming-only change preserves `partner`
and `stone` schemas, stored data, gateway compatibility, and the existing storage volume; it
does not complete domain route parity or remove the gateway. GP-MASTER-01/02 and the broader
migration remain open. See the
central [GMS migration TODO](../task/todo/gms-platform-migration.md) and owner-review tickets
[INV-20261021-006](../task/investigation/INV-20261021-006-gms-master-auth-boundary-validation.md)
and [INV-20261021-007](../task/investigation/INV-20261021-007-partner-master-test-database-target.md).

The owner approved [INV-20261021-006 SA revision 1 / ADR-0031](../reviews/sa/2026-10-21-gms-inv006-auth-boundary-rev1.md)
for its exact local-dev endpoint, reader-role, route, secret and network scope on 2026-10-21.
The original approval-source research hash is `2A8939CA682FEAC5551E2D469F2CFC945A53B06473378B66DCFC38348478217D`.
Infra then refreshed the version-specific research and prepared the scoped overlay:
[security bundle](services/gms-master-auth-boundary/1/security.md), current bundle hash
`EF342661C427DFF6DA9EF5EFB944EE05C5638B34215ED2A1A966B4EBF96C06BF`, Compose draft
hash `DFB82BC3640CDA2C3805DC6105468627662D3EBB29D91C6568550271F655399B`, and Nginx draft
hash `9D1E4675078B875FFE11963673B4F5EFFB00CF5CC193DC62D8BBDD389416D0E1`. Static Compose
render passed with the local environment. Docker bridge membership remains no source ACL;
the file-backed auth application token is mandatory. The dedicated `gms_master_authz_reader`
role was provisioned on the existing local database with only database connect, auth schema
usage and view select; initial privilege flags confirmed no schema create, view insert, auth
base-table select, partner table select or license decision table select. Final source
manifest `9f9134c57c1db93236280bf8592e65f8fdf0343611f496dca6dbf29c93b2ce3c` passed both
scoped security reviews for that source revision. The subsequent naming-only identity change
is recorded in ADR-0025/0027 and verified in [the local identity report](../task/done/2026-10-21-gms-api-master-identity.md).
Local Nginx, mounted authorization, private bearer rejection, read-only secret mounts and
named-volume preservation checks passed; full evidence is in the
[security bundle](services/gms-master-auth-boundary/1/security.md) and
[INV-20261021-006](../task/investigation/INV-20261021-006-gms-master-auth-boundary-validation.md).
No image rebuild, prune, data reset or volume replacement occurred. Production load,
capacity, gateway removal and cutover remain out of scope.
