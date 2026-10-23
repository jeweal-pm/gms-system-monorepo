# GMS file storage migration — infra research revision 1

- Date: 2026-10-21; status: research for SA review only, no runtime config changed
- Scope: existing auth and partner image storage moving to GMS fs profile; current Compose services, target `/srv/gms/storage`, named-volume preservation and Nginx read-only delivery
- Source: [SA bundle](../../../../apps/backend/storage/gms-file-migration/architecture.md), [GMS spec §3 and §8](../../../../gms-platform-spec.md), [ADR-0027](../../../../adr/0027-gms-master-inventory-data-and-operations.md), [current infra gms-target rev2](../../gms-target/2/security.md)
- Local engine observed: Docker Engine 25.0.3 and Compose 2.24.6-desktop.1 on Docker Desktop Windows; production Linux Engine/Compose and kernel versions are unknown and must be checked before implementation.
- Official research checked: 2026-10-21; review by 2026-11-20 or sooner on Docker/Compose/host version, file profile, key/auth interface, path, image, or security advisory change.

## Mount and access model

No new container/image is needed. On the selected Linux fs profile, the target mount is the host directory `/srv/gms/storage` at the same path in each eligible container. `api-auth` and `api-master` receive read-write mounts only if their package needs writes; Nginx receives a read-only mount only when protected delivery is implemented; frontend, PostgreSQL, Redis, worker and unrelated services receive no mount in this scope. `.tmp` is disk-backed and under the same filesystem as final objects for atomic rename. No tmpfs.

Do not configure a host path by Compose short syntax that silently creates a missing path. Use long bind syntax with `create_host_path: false`, pre-create the directory on the host, inspect UID/GID/mode, and check `docker inspect` confirms mount source, destination, and `RW` values. Bind mounts are powerful host access: expose only `/srv/gms/storage`, never `/srv/gms`, the Docker socket, or the repository. No recursive ownership change over customer data. Exact directory ownership/ACL, SELinux/AppArmor labels, filesystem/quota and Linux kernel capabilities must be validated on the customer host before rollout.

## Required paths and communications

| Caller | Target | Access | Network | Egress |
|---|---|---|---|---|
| backend-api-auth | `/srv/gms/storage/files/auth/` and `.tmp` | RW, restricted UID/GID and service-prefix enforced in adapter | existing private API/DB networks only | none for fs profile |
| backend-api-partner (current company-profile owner) | `/srv/gms/storage/files/partner/` and `.tmp` | RW, restricted UID/GID and service-prefix enforced in adapter | existing private API/DB networks only | none for fs profile |
| Nginx | storage root | RO; only internal protected location | existing frontend-facing route to authorized APIs | none |
| frontend/PostgreSQL/other | none | no access | unchanged | none |

Nginx's internal alias must map to validated bucket/key, reject external direct access, disable directory listing, set `X-Content-Type-Options: nosniff`, and use bounded response headers. Authorization remains with the owning API and short-lived capability; a filesystem path/key is not a credential. Keep existing permissions and no public logo/user photo behavior. API upload byte limits remain 5 MiB and 10 MiB. No globally disabled proxy buffering or unbounded temp space.

## Data migration, backup and rollback

Before a customer migration: inventory named volumes without opening image content; obtain DB plus both volume backups and verify restore; confirm target filesystem capacity and customer-selected off-host backup/RPO/RTO; pre-create host path; run an idempotent bounded copy with manifest, byte length and SHA-256, not a bulk shell `cp` without evidence. Do not write directly into the target production directory until the maintenance scope is approved. Compare source/destination counts and checksums; retain original volumes read-only during the rollback window. Rollback switches to the old image and old path only while metadata compatibility is guaranteed. Never remove volumes or source bytes in this bundle.

Local Docker Desktop test volumes are not production Linux host paths. Do not copy Windows local volumes into `/srv/gms/storage` automatically. Runtime setup, container recreation and data movement need an exact owner-selected rollout task.

## Security and capacity controls

Filesystem storage consumes host disk and page cache but adds no service memory cap. Stream each object with existing 5/10 MiB limits, bound concurrent uploads, cap logs, and reserve disk for OS/database/backups. Monitor free space and failed writes; alert threshold and filesystem quota need host-owner decision. Application adapters must enforce the `auth/` and current-owner `partner/` key prefixes, reject traversal, use atomic temp publish and never reveal paths in responses/logs. Nginx RO does not prevent data exfiltration; authorization and internal-only routing remain required. A future move from `partner/` to `master/` is part of api-master cutover.

No new CPU/RAM service or DB pool. Do not add a worker solely for purging until SA resolves the policy and capacity. The 30-day physical purge can be a separately scheduled bounded operation only if owner approves and there is an auditable runbook; do not silently improvise a cron container.

## Rollout checks and current result

For a later authorized stage: `docker compose config` without exposing secrets; ensure target source path exists; inspect effective mount modes; test API writes only inside its assigned prefix, Nginx reads but cannot write, frontend/DB have no mount, and direct external `/_storage/` is denied; test traversal and unauthorized download; stream maximum-size uploads under bounded concurrency; restore a sample from backup; measure disk, RSS, CPU and request latency. This draft performed static docs/source/volume inspection and old auth/partner test suites only. It did not alter Compose, volumes, host files or live data and makes no production rollout claim.

## Official sources

- [Docker Engine bind mounts](https://docs.docker.com/engine/storage/bind-mounts/) — host access, read-only behavior, mount obscuring, `--mount` source behavior, Docker Desktop boundary.
- [Docker Compose service mount syntax](https://docs.docker.com/reference/compose-file/services/) — long syntax, `read_only`, and `bind.create_host_path: false`.
- [Docker Engine volumes](https://docs.docker.com/engine/storage/volumes/) — named volumes are Docker-managed persistent storage distinct from container layer.

Refresh version-specific guidance on the actual Linux engine before applying config. No service-index status is marked implemented from this research draft.
