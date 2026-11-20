# Production capacity

Host: **4 GB RAM / 2 vCPU** ([ADR-0024](../adr/0024-production-host-4gb-2vcpu.md), from 2026-10-19;
previously 8 GB / 4 vCPU). Source of truth for the limits is `docker-compose.yml`; update this table in
the same change.

| Container | CPU | Memory | Node heap cap |
|---|---|---|---|
| postgres | 0.60 | 1024 MiB | —; `/dev/shm` allocation ceiling 256 MiB |
| backend-api-auth | 0.30 | 512 MiB | 320 MiB |
| api-master | 0.25 | 384 MiB | 256 MiB |
| frontend | 0.30 | 640 MiB | 384 MiB |
| nginx | 0.10 | 64 MiB | — |
| backend-api-inventory ([ADR-0052](../adr/0052-load-to-stock-in-backend-api-inventory.md) D14, from 2026-11-17) | 0.20 | 256 MiB | 160 MiB (pids 128) |
| **Total (GMS Compose profile)** | **1.75 vCPU** | **2880 MiB** | |
| Headroom (OS, Docker, page cache) | ≈ 0.25 vCPU | ≈ 1216 MiB | |

One-off `backend-api-inventory-migrate` (0.20 vCPU / 256 MiB) exits before `backend-api-inventory`
starts (`service_completed_successfully`), so it does not raise the peak.

History of the total (merged `docker-compose.yml` + `docker-compose.gms.dev.yml`, verified against the files
on 2026-11-17): **1.55 vCPU / 2624 MiB** before ADR-0052 → **1.75 vCPU / 2880 MiB** after. The figure
"1.70 vCPU / 2944 MiB" still quoted in ADR-0024, `tech-stack.md`, `workflow/ui-delivery.md`,
`apps/backend/architecture.md` and older bundles is the ADR-0024 five-service stack that included
`backend-api-gateway` (0.25 / 384 MiB) and no Nginx; the gateway is no longer a Compose service
(1.70 − 0.25 + 0.10 = 1.55; 2944 − 384 + 64 = 2624). ADR-0024 keeps its historical figure.

DB connections: auth ≤ 5, api-master 5 + authz reader 1, inventory 5 + authz reader 1, +1 during the
inventory migration job.

Dev watch mode (`docker-compose.dev.yml`): auth and frontend 1 vCPU / 1536 MiB with heap caps cleared;
api-master 1 GiB with `--max-old-space-size=768`; backend-api-inventory 0.5 vCPU / 768 MiB with
`--max-old-space-size=512` (its migrate job 0.5 vCPU / 512 MiB); Postgres and Nginx retain their profile limits.

PostgreSQL `shm_size: 256mb` sets the container's `/dev/shm` capacity for dynamic shared-memory
operations (including parallel queries). This is an allocation ceiling inside the existing 1024 MiB
Postgres container limit, not another 256 MiB added to the host budget. It matches
[GMS platform spec §3.2](../gms-platform-spec.md#32-memory-budget-compose-mem_limit). Actual query
memory use and 4 GB host capacity still require measurements.

## Measurements

| Date | Environment | auth | legacy gateway | legacy partner | frontend | postgres | Notes |
|---|---|---|---|---|---|---|---|
| 2026-10-19 | local, **dev watch mode**, idle | 538 MiB | 433 MiB | 398 MiB | 630 MiB | 45 MiB | Not production: includes compilers / Next dev server |

Pending (ADR-0024 acceptance): production images idle and under load, and the real host's `free -m` / `nproc`.
Pending (ADR-0052 D14): `backend-api-inventory` built-image idle RSS, RSS/p95 during a 200-row apply and with
200 open SSE streams, and host `free -m` with all containers.
