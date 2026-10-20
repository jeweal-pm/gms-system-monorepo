# Production capacity

Host: **4 GB RAM / 2 vCPU** ([ADR-0024](../adr/0024-production-host-4gb-2vcpu.md), from 2026-10-19;
previously 8 GB / 4 vCPU). Source of truth for the limits is `docker-compose.yml`; update this table in
the same change.

| Container | CPU | Memory | Node heap cap |
|---|---|---|---|
| postgres | 0.60 | 1024 MiB | — |
| backend-api-auth | 0.30 | 512 MiB | 320 MiB |
| backend-api-gateway | 0.25 | 384 MiB | 256 MiB |
| backend-api-partner | 0.25 | 384 MiB | 256 MiB |
| frontend | 0.30 | 640 MiB | 384 MiB |
| **Total** | **1.70 vCPU** | **2944 MiB** | |
| Headroom (OS, Docker, page cache) | ≈ 0.30 vCPU | ≈ 1.1 GiB | |

Dev watch mode (`docker-compose.dev.yml`): 1 vCPU / 1536 MiB per Node container, heap caps cleared.

## Measurements

| Date | Environment | auth | gateway | partner | frontend | postgres | Notes |
|---|---|---|---|---|---|---|---|
| 2026-10-19 | local, **dev watch mode**, idle | 538 MiB | 433 MiB | 398 MiB | 630 MiB | 45 MiB | Not production: includes compilers / Next dev server |

Pending (ADR-0024 acceptance): production images idle and under load, and the real host's `free -m` / `nproc`.
