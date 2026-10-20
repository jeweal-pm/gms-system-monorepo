# ADR-0025: GMS domain routing with tRPC and Better Auth retained

- Status: Accepted for staged implementation; cutover separately gated
- Date: 2026-10-20
- Feature / source UI revision: `gms-platform-migration` / none (platform architecture)
- SA revision: 1
- Deciders: project owner
- Approval evidence: 2026-10-20 owner reply "อนุมัติ SA revision 1 และเริ่มงานที่ไม่ติด blocker" to the linked SA review
- Related: [GMS spec v1.1](../gms-platform-spec.md), [feasibility review](../reviews/sa/2026-10-20-trpc-better-auth-gms-platform-feasibility.md), [ADR-0007](0007-trpc-procedure.md), [ADR-0008](0008-use-better-auth.md), [ADR-0018](0018-customer-master-partner-service.md), [ADR-0024 capacity](0024-production-host-4gb-2vcpu.md), [SA review](../reviews/sa/2026-10-20-gms-platform-migration-rev1.md)

## Context

Today the browser uses Next `/api/trpc` and `/api/auth` proxy routes. A NestJS gateway owns the tRPC router and calls auth and partner over internal HTTP. GMS v1.1 calls for Nginx as sole public ingress, domain APIs, no permanent Node gateway, and same-origin browser requests. Retaining tRPC as a transport does not require retaining that gateway. This ADR does not alter approved screen behavior by itself.

## Decision

1. Target public paths: Nginx `/api/auth/*` to `api-auth` (Better Auth and auth-owned tRPC at `/api/auth/trpc`), `/api/master/*` to `api-master` (master-owned tRPC at `/api/master/trpc`), `/api/inventory/*` to `api-inventory` (typed REST for initial stock operations; tRPC is optional only through a later approved contract), and all remaining requests to Next. Nginx alone publishes 80/443. No public `/internal/*` paths.
2. Domain-owned tRPC routers replace the shared gateway router procedure by procedure. Keep existing Zod schemas/semantics where compatible; use separate typed clients and domain router types, not a gateway import. Browser uses relative paths and credentials. Next SSR uses internal service DNS with bounded requests and forwards permitted auth cookies; a refresh from SSR must forward Set-Cookie to the browser.
3. Better Auth stays in auth for username/password, database session and account administration. [ADR-0026](0026-gms-access-tokens-and-live-authorization.md) defines a separate access JWT and rotating refresh credential. Better Auth's opaque session cookie is not the access JWT. A license-server signed token is also distinct from the user access JWT.
4. Existing partner schemas and data remain in place until the [master data migration ADR](0027-gms-master-inventory-data-and-operations.md) is approved and cutover verified. `backend-api-partner` may be *renamed/adapted* into `api-master`; no copy into a new database solely for a service name change. Existing `partner` and `stone` schemas require a deliberate ownership migration; avoid a big-bang schema rename.
5. Rollout is phase gated: (0) auth contracts and capacity proof; (1) Nginx + auth path on a nonproduction environment, keeping the legacy frontend proxy as a rollback route; (2) master router procedure parity and client cutover by feature; (3) inventory boundary, storage and worker only when their own contracts/capacity are approved; (4) remove gateway and legacy Next proxy routes after all callers and observability prove zero usage. Never add every proposed container to the current Compose stack at once.

## Alternatives

| Alternative | Finding |
|---|---|
| Permanent private gateway behind Nginx | Keeps one router but violates GMS §2 and leaves an extra 384 MiB/0.25 vCPU cap on the 4 GB/2 vCPU host. Could be a temporary, explicitly approved compatibility phase only. |
| Rebuild all APIs as REST | Discards working tRPC types and procedures without a technical need. Inventory REST can coexist with domain tRPC. |
| Put the router into Next `/bff/` | Recreates a gateway hop in the frontend process and burdens a 256 MiB target; reserve BFF for small UI composition. |

## Consequences and capacity

Each API owns validation, JWT verification, CSRF defense, grants, license and output masking. Calls between domains use narrow authenticated internal APIs, never arbitrary client-provided actor headers. Public error envelope and request ID remain consistent. Existing frontend `/api/trpc`, `/api/auth`, `/api/v1` proxy routes are removed only after route parity and rollback readiness. Compatible typed clients cannot imply authorization; server checks remain mandatory.

Target GMS memory caps sum to 3040 MiB excluding OS (~500 MiB) for db-local+fs: postgres 1024, frontend 256, auth 384, master 384, inventory 256, worker 512, redis 192, nginx 32. This leaves ~556 MiB nominal in 4096 MiB; swap is an emergency buffer, not capacity. CPU caps and actual RSS/p95 remain to be measured by infra on full production images. If the profile cannot run with host headroom, do not enable worker/inventory together; stage work or revise the profile through a separate approved ADR. PostgreSQL app pools 5+10+10+5 = 30, with max_connections 40 and headroom for migration/admin. No unbounded SSR or lists; page size max 200. [Infra bundle](../infra/) and [DevOps bundle](../devops/) must be linked into final approval by parent when exact service revisions are available.

## Acceptance and approval

The owner approved this ADR revision 1 and the linked [migration TODO](../task/todo/gms-platform-migration.md), [main flow](../diagram/gms-platform-request-flow.md), and SA bundle on 2026-10-20 for work without blockers. Exact customer profile, new inventory slice, external license contract and cutover retain their separate gates. Check same-origin sign-in, all migrated route parity and authorization, bounded pagination, no published internal ports, SSR cookie propagation, production capacity and feature rollback before removing gateway. Deployment needs its own authorization.
