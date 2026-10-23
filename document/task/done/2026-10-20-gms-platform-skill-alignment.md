# GMS platform skill and agent alignment — 2026-10-20

Status: skill and agent definitions updated from
[GMS Platform Engineering Spec v1.1](../../gms-platform-spec.md). This task changed
documentation and instructions only; it did not change application code, Compose, running services, or
production deployment.
Source SHA-256: `97677831d501e4670b2ace5dc746cf3da2ca6f9ae176523ebf21ab1e5c10e086`.

## Role updates

- Frontend: same-origin API and `/bff/` target, internal server fetching, runtime
  customer configuration, cookie/CSRF handling, bounded SSR, queued-job and file UI,
  Thai dates, and standalone-image/capacity handoff.
- Backend: target service/data ownership, bounded PostgreSQL queries and profile
  portability, stock transactions, document numbering and idempotency, worker queues,
  streaming storage, authentication, observability, and applicable verification.
- Infra: customer DB/file profiles, Nginx-only target ingress, local/managed PostgreSQL,
  Redis and worker resources, filesystem/S3/Garage storage, backups, restore drills,
  security and total 4 GB RAM / 2 vCPU capacity.

The `lead-frontend-engineer`, `senior-nestjs-developer`, and `infra` skills now link
the spec and their relevant sections;
`.codex/agents/` and `agents/` contain matching role instructions. Existing UI/SA approval,
automated-testing, dual security review, investigation, remediation and shared-file
ownership rules remain in effect.

## Architecture boundary

The current accepted design uses a Node gateway/tRPC, `backend-api-partner`, Better Auth,
and ADR-0024's five-container capacity allocation. The GMS spec describes a target with
Nginx path routing, `api-master`/inventory, Redis/worker, independent DB/file profiles,
and different service limits. The updated roles must use current approved contracts for
existing work and route a specific migration design through SA and owner approval before
changing service boundaries, authentication, data ownership, deployment or dependencies.
The spec alone does not approve enabling new containers or profiles. In particular,
`db-local + s3-garage` is outside the spec's 4 GB baseline.

Static checks: reviewed role diffs, verified each agent mirror matches its `.codex/agents/`
source, confirmed the eight shared Claude/Codex skills match, checked naming references
and diff whitespace. No application tests were added or run because this task changed
documentation and instructions only.

## GMS naming and Claude alignment

The application name and target-spec file are now `GMS` and
[`gms-platform-spec.md`](../../gms-platform-spec.md). Illustrative database roles,
database URL, package scope `@gms/storage`, and image repository paths use `gms`.
`ERP` remains only where it describes the software category. The SA feasibility
review and all links to the target spec were updated accordingly. Claude's
frontend/backend/infra skills and agent wrappers now carry the same target
architecture and approval boundary as the Codex definitions. No application
service, container, package, database or production resource was renamed.
