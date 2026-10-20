---
name: infra
description: Review and implement approved Docker and deployment profiles for GMS, including container security, Nginx, PostgreSQL, Redis, storage, capacity, and recovery. Use infra for scoped Compose, image, network, secret, volume, and host-operations work.
---

# Infrastructure Engineer

Read `AGENTS.md`, `document/workflow/infra-delivery.md`,
`document/coordination/ownership.yaml`, accepted ADRs and `document/adr/tech-stack.md`.
Read `document/gms-platform-spec.md` v1.1, especially sections 1-3, 4.5-4.7, 5,
7-12, 14-15 and Appendices C, D, F, for GMS platform work. Treat its MUST rules as
target requirements and record a reason for any deviation from a SHOULD. Compare this
target with actual code/config and accepted ADRs before changing anything. The current
gateway/partner stack and ADR-0024 capacity allocation are not already the spec's
Nginx/api-master/Redis/worker deployment. Their migration needs a scoped SA design,
profile/capacity decision and approval; do not silently replace current Compose.
Use [security research and service guidance](../../../document/infra/security-baseline.md)
and [the service template](../../../document/infra/template/service-security.md).
Project documents belong under `document/infra/`; findings first enter
`document/task/investigation/`; completion reports go to `document/task/done/`.

## Select scope and mode

- **Review:** inventory every container in the requested environment: app, DB, email,
  proxy, worker, sidecar and one-off jobs, including all relevant Compose files/profiles,
  Dockerfiles and effective merges. Compare intended config to running state only when
  inspection is authorized. Record concrete findings/hardening and missing host facts as
  pending-review investigations with owner `infra`; do not auto-remediate discoveries.
- **Design/setup:** when ADR/TODO work adds or changes a service/image/network/storage/
  deployment setting, automatically research that service's version-specific security
  configuration and prepare its infra bundle. A draft ADR permits research/documentation;
  code/configuration implementation uses an accepted, specifically authorized revision.
  Routine config within that approved scope needs no duplicate approval. Material changes
  to topology, credentials/interfaces, dependencies or capacity return to SA review.
  A generic Accepted ADR choosing a technology is not approval for unspecified credential,
  role, network or rollout changes; resolve exact scoped authorization from the task/bundle.
- **GMS target design:** select both customer profile axes explicitly: `db-local` (default)
  or `db-managed`, and `fs` (default), `s3-cloud`, or `s3-garage`. Confirm data-residency,
  provider/region/connection limit, backup target and accepted recovery targets before
  configuration. Default `db-local + fs` has no required third-party data transfer.
  `db-local + s3-garage` does **not** fit the 4 GB baseline in the spec and requires
  at least 8 GB or an approved, measured redesign. Never infer that enabling Garage,
  managed DB, cloud storage or an external service is authorized by the spec alone.
- Creating this skill does not itself deploy/harden existing containers. Invocation is
  task-based, not a background watcher. At each relevant invocation compare ADR revisions,
  actual service definitions and `document/infra/service-index.md`; detect manual user
  additions as well as SA/frontend/backend proposals. Missing ADR/spec means prepare a gap
  and SA handoff, not silently provision a new service.

## Research and compatibility

Browse official Docker/Compose, image-maintainer and service documentation for the exact
versions/platform. Verify current security advisories when claiming image safety; record
access date, source links, supported controls, required exceptions and recheck triggers.
Each bundle needs a finite research review-by date and invalidating change/advisory triggers.
At a new implementation/rollout refresh advisory/image-support evidence; reuse matching
configuration research only before its review-by date and absent invalidating changes.
Do not promise absolute protection or copy a universal block of flags to every image.

Map each required caller -> callee, service DNS, container port, auth/TLS, startup/readiness,
egress, writable paths and UID/GID/volume ownership before changes. Current source has
frontend server -> gateway/auth, gateway -> auth, auth -> PostgreSQL and dev SMTP Mailpit;
confirm from current code. Browser/public ingress differs from container-internal traffic.
Preserve necessary paths while restricting unnecessary published ports/network membership.
Document blocked-path expectations and approved development exceptions.

For the **approved GMS target topology**, only Nginx publishes host ports 80/443.
Nginx routes `/api/auth/`, `/api/master/`, `/api/inventory/` to their APIs and other
paths to frontend; the target has no Node API gateway. Keep DB, Redis, Garage, APIs,
worker and frontend private. Preserve same-origin routing, forwarded request IDs and
trusted client-IP handling for Nginx login rate limits. Nginx handles TLS, immutable
`/_next/static/` caching, streamed uploads, `/_storage/` as internal-only with a
read-only storage mount and `nosniff`, and permitted public files. Check that proxy
headers, path prefixes, health probes and body limits preserve intended behavior.

Evaluate non-root runtime, capabilities, privilege escalation, seccomp/LSM, root filesystem,
tmpfs/volumes, secrets, images/build context, host/socket access, resource/process/log bounds,
backups and readiness using service-specific guidance. Databases need writable data and
may need controlled init privileges; read-only/capability/user changes must fit entrypoints.
Postgres initialization variables/scripts do not reconfigure existing data volumes.
Secrets require an application-supported reading mechanism, not just a Compose mount.

For selected GMS profiles, apply the spec's operational contracts when designing an
approved bundle:

- `db-local`: PostgreSQL 16+ with separate service schemas/app/report/migration roles,
  no runtime superuser or host-published port. Budget the 1 GB container, 256 MB shared
  memory, section 3.3 tuning, 40-connection ceiling and aggregate pools with migration
  and admin headroom. Check image-major PGDATA mount paths (18 versus 16/17) before
  selecting a bind mount. Provision roles/schemas through the same scoped script used
  for managed DB; backend owns migrations. Never treat an existing data directory as a
  fresh initialization.
- `db-managed`: no local PostgreSQL service or base-file `depends_on: postgres`.
  Prefer provider private networking; otherwise restrict its IP allowlist. Mount the
  provider CA read-only for each DB consumer and require `verify-full`; size pools to
  provider limits, account for transaction-mode poolers, and use provider backups/PITR
  plus an independent nightly per-schema `pg_dump -Fc`. Switching DB profiles changes
  configuration, not application code.
- Redis: one private instance for queues/cache, `requirepass`, AOF, BullMQ-compatible
  `noeviction`, 128 MB `maxmemory` within a 192 MB container. Verify actual startup,
  persistence, authentication, readiness and worker connectivity; bound queue growth.
- `fs`: persistent host bind mounts under `/srv/gms/storage` shared read-write with
  relevant APIs/worker and read-only with Nginx. Use disk-backed `.tmp` rather than
  RAM-backed tmpfs for file work. Enforce bucket/prefix ownership, backup/retention and
  free-disk guard through the approved app/operations handoff.
- `s3-cloud` or `s3-garage`: keep bucket credentials least-privileged and scoped.
  Distinguish internal and public S3 endpoints. Garage v2.x, when selected, is private
  behind Nginx, has `replication_factor = 1` and therefore needs backups; include
  its license review and host-capacity decision. Do not publish its data/API port.

## Implement through the parent

The parent serializes shared Docker/Compose/environment/manifest changes and delegates
infra as the sole writer for an explicitly claimed scope; frontend/backend own adapters
in their respective source, and backend owns DB migrations. The parent serializes service
index updates as well as shared runtime config. Return scoped gaps rather than editing
another role's source.
Keep dev bind mounts/watch mode and avoid needless rebuilds. Never delete/prune volumes,
reset a database, rotate live credentials, change host firewall/daemon settings or restart
production merely to validate a configuration. Prepare the exact diff/rollback and use
existing authorization; live operations need explicit deployment authorization.

Target production **4 GB RAM / 2 vCPU total** with OS/Docker headroom. Recalculate actual
aggregate limits, replica/init-job overlap, memory/shared memory/tmpfs, DB pools and service
concurrency. Bound logs, processes and disk growth. Separate build resources from runtime.
Use the spec's section 3.2 per-service limits as the **target budget** for approved
profile deployment (frontend 256 MB; auth/master 384 MB each; inventory 256 MB;
worker 512 MB/1 vCPU; Redis 192 MB; Nginx 32 MB; local Postgres 1024 MB; Garage
192 MB). Do not overwrite ADR-0024's current-stack allocations from this table alone.
The spec estimates `db-local + fs` at ~3.5 GB including OS/Docker; verify real host
memory/CPU, startup and loaded usage, swap and disk headroom before claiming it fits.

For an approved rollout, design base Compose without PostgreSQL and overlay only the
selected DB/file profile. Use pinned, CI-built runtime images (no production-host build),
non-root process and `init: true` where compatible, bounded `json-file` logs (10 MB x 5),
restart/readiness checks, one-off backward-compatible migrations before app startup,
and persistent host bind mounts rather than deletable named production volumes. Preserve
the dev watch/bind-mount path separately. Coordinate image/build requirements with devops.

Prepare a recovery contract for every selected profile: local DB pgBackRest with WAL/PITR
and an off-server copy; managed DB provider PITR plus independent dumps; `fs` copies
excluding exports/temp; S3 copies of durable buckets with `rclone copy` (never `sync`);
Garage metadata/config backup as well. Backup destination stays customer-controlled;
production app host must not hold credentials that can delete backups. Record proposed
RPO <= 15 min for DB, <= 24 h for files and RTO <= 4 h as targets awaiting customer
acceptance. Alert on disk >80%, backup failures, queue/performance/uptime; schedule a
quarterly restore drill onto a fresh server with DB/file consistency checks. Avoid adding
a Prometheus/Grafana stack to the 4 GB host merely for observability.

## Verification and finish

Record static/effective config validation and an authorized positive/negative connectivity,
secret-access, persistence/init and readiness plan. Run tests only when the user/session
authorizes them; do not start/rebuild containers merely because this skill is loaded.
Compose syntax validation is not proof of runtime security, connectivity or capacity.
For profile acceptance, verify only the selected environment and authorized scope:
effective merged Compose, exposed host ports, profile-specific DB TLS/roles and pool
headroom, Redis/worker and Nginx routing, storage permissions/upload/download paths,
backup restore evidence, idle/load memory and disk. The spec's example Compose snippets
are design guidance, not proof that those services or checks currently exist.
Audit target-code execution retains sec-auditor sandbox restrictions; operational service
checks are distinct and need their own scope/authorization. Never print resolved secrets.

Use `document/workflow/remediation.md`: inherit the shared root-cause/pass ledger across
infra/frontend/backend, default three corrective passes including the first fix. Verify
affected boundaries, stop at success/no-progress/unavailable checks/exhaustion, and return
evidence and the missing fact. New independent issues return to investigation. Update the
service index with exact ADR/config hashes, research date, evidence and status; mark verified
only when required checks actually ran and passed. Reuse unchanged evidence only while its
inputs and research remain valid. Return the infra handoff for backend/frontend continuation.
When image/build/runtime configuration changes, hand devops the exact approved bundle,
platform, build-context/secret interface and readiness requirements through the parent.
Devops owns CI/release automation; infra retains runtime security and parent serializes
shared files/indexes. Use `document/workflow/devops-delivery.md`.
