# Backend implementation guide

Verified against the checkout on **2026-10-11**. Accepted decisions are in
[tech-stack.md](../../adr/tech-stack.md); inspect current source/manifests before choosing
transport, database behavior, or packages.

## Current services and contract

- `backend-api-gateway`: NestJS HTTP application, port 4000 by default, tRPC router in
  `src/trpc/router.ts`, and HTTP/CRM boundary. `src/main.ts` obtains the Better Auth session
  from auth with a bounded timeout. Frontend uses its same-origin proxy.
- `backend-api-auth`: NestJS HTTP application, port 3101 by default, Better Auth Node handler
  mounted at `/api/auth`, and auth controllers/services. It sends no email
  ([ADR-0015](../../adr/0015-remove-forgot-password-and-email.md)).
- Both are HTTP today; no TCP transport, approval/notification service, Redis, or BullMQ
  dependency is configured in this checkout. Do not assume those services exist.
- Prisma 7 and PostgreSQL adapter/pg are installed. Auth owns its Prisma schema, committed
  migrations, generated client, and lifecycle in `backend-api-auth/prisma/` and
  `backend-api-auth/src/database/`. Never hand-edit generated Prisma output.
- Root workspace uses pnpm 10.22.0. Database lifecycle and service module ownership follow
  [ADR-0001](../../adr/0001-record-architecture-decisions.md).
- Existing login, lockout, profile-password, and CRM provisioning (CRM-supplied password) contracts are in
  `document/spec/`, `document/diagram/login-flow.md`, and accepted auth ADRs.

## Service changes

SA documents new/changed flow, service ownership, sequence/ER diagrams, public API contract,
authorization, errors, capacity, migrations, and dependency decisions in
`document/apps/backend/<service>/<feature>/`. Use
[the service templates](template/auth-service/). The owner reviews the exact SA revision
before dependent implementation. Reuse unchanged approved contracts without repetitive
architecture work. The main user flow lives under `document/diagram/`.

Validate input at actual boundaries, enforce authorization in backend, limit public error
detail, and keep credentials and personal data out of logs. Use domain-owned tables and
public cross-service interfaces. Specify transaction/consistency and retry/idempotency
behavior when the feature requires it.

## Capacity and checks

Production has **8 GB RAM / 4 vCPU total**. Read Compose for actual aggregate limits
(current baseline approximately 5.3 GB / 3 vCPU), preserve OS/Docker headroom, and bound
database pools, pagination/query sizes, concurrency, retries, caches, and worker count.
New services, queues, caches, or replicas require a justified ADR and capacity proposal.

Discover scripts from affected manifests. Auth has typecheck/build with Prisma generation,
ESLint, and database commands; gateway has typecheck/build/lint. No test runner is currently
configured. Run applicable checks and migration/contract verification; record failures or
unavailable checks accurately. Serialize manifests, lockfiles, Prisma roots, app composition,
and Docker edits through the parent integration owner.

Task records: `document/task/`; handoffs: `document/coordination/handoffs/`; reviews:
`document/reviews/`; changelog: `document/changelog/`.
