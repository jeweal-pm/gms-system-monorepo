# ADR-0024: Production host reduced to 4 GB RAM / 2 vCPU

- Status: Accepted
- Date: 2026-10-19
- Feature / source UI revision: none (infrastructure capacity)
- SA revision: n/a
- Deciders: owner
- Approval evidence: owner 2026-10-19: "Production has 4 GB RAM / 2 vCPU total เพราะมีลดสเปค", then "แก้ไขให้เป็นสเปคใหม่ด้วย ต่อเลย"
- Supersedes / related ADRs: replaces the capacity baseline in [ADR-0001](0001-record-architecture-decisions.md) (8 GB RAM / 4 vCPU). The capacity sections of ADR-0013…0019 are kept as written; their totals described the old host.

## Context

The production host spec was reduced from 8 GB RAM / 4 vCPU to **4 GB RAM / 2 vCPU**. Before this
change, `docker-compose.yml` limited the five containers to **3.20 vCPU / 5.5 GiB** in total, which is
more than the new host has. Under load, the Linux OOM killer could stop a container, or the whole host
could start swapping.

Measured on 2026-10-19 with `docker stats` on the local stack in **watch mode** (Nest watch, Next dev
server; this uses more than a production start): auth 538 MiB, gateway 433 MiB, partner 398 MiB,
frontend 630 MiB, postgres 45 MiB, all idle.

## Decision

Production Compose limits ([docker-compose.yml](../../docker-compose.yml)):

| Container | CPU | Memory | Node heap cap (`--max-old-space-size`) |
|---|---|---|---|
| postgres | 0.60 | 1024 MiB | — |
| backend-api-auth | 0.30 | 512 MiB | 320 MiB |
| backend-api-gateway | 0.25 | 384 MiB | 256 MiB |
| backend-api-partner | 0.25 | 384 MiB (pids 128) | 256 MiB (was 320) |
| frontend | 0.30 | 640 MiB | 384 MiB |
| **Total** | **1.70 of 2 vCPU** | **2944 MiB (≈2.9 GiB) of 4 GB** | |

Headroom ≈ 0.3 vCPU / 1.1 GiB for the OS, the Docker daemon and page cache. CPU limits are caps, not
reservations, so idle containers leave CPU to busy ones; memory limits are the hard bound.

Node heaps are capped at 60–65 % of each memory limit, so V8 collects garbage before the container
reaches its limit; the rest covers native memory (Prisma engine, buffers, argon2/crypto).

`docker-compose.dev.yml` gives watch mode its own limits (auth, gateway, frontend: 1 vCPU / 1536 MiB, heap cap
cleared; partner: 1 GiB with `--max-old-space-size=768` as set on `dev` for stone-master): a developer
workstation is not the production host.

Unchanged: partner pool max 5 connections; PostgreSQL default `max_connections` (100) and
`shared_buffers` (128 MB) fit in 1 GiB.

## Alternatives

- **Keep the old limits:** their sum (5.5 GiB) is more than the host, so the limits would no longer
  protect the host. Rejected.
- **Merge services into fewer containers:** saves per-process Node overhead (~60–80 MiB each) but
  reverses the service split (ADR-0001, ADR-0018). Revisit only if measured production memory does not fit.
- **Swap on the host:** hides memory pressure as latency; allowed only as an OS-level safety net, not as
  capacity.

## Consequences and capacity

- New services, workers, caches or replicas must fit in the ~1.1 GiB / 0.3 vCPU that is left, or reduce
  an existing limit; each needs its own capacity proposal.
- Large uploads: company logo (≤ 10 MB, about 2 × file size held across gateway and partner) still fits
  in 384 MiB per container; uploads are rare admin actions.
- Rollback: restore the previous limits in `docker-compose.yml` (git history) on an 8 GB host.

## Acceptance and approval

Done 2026-10-19: `docker compose config` renders both the base and the base + dev files with the new limits.

**Not yet verified, needed before claiming production capacity:**

1. Run the production images (`docker compose -f docker-compose.yml up`) and record idle and loaded
   `docker stats`; every container should stay below about 80 % of its memory limit.
2. Smoke test: sign in, customer/vendor list and save, company profile logo upload.
3. Check the real host (`free -m`, `nproc`): 4 GB / 2 vCPU with no other workloads.

Raise a container's limit (and lower another) only with those measurements, recorded in
[document/infra/capacity.md](../infra/capacity.md).
