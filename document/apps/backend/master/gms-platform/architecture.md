# Service architecture: master / GMS platform migration

- Feature/SA revision: `gms-platform-migration` / 1; status: approved-design; see central TODO gates; source UI revision: none
- Central TODO: [GP-MASTER](../../../../task/todo/gms-platform-migration.md); [SA review](../../../../reviews/sa/2026-10-20-gms-platform-migration-rev1.md)
- ADRs: [domain routing](../../../../adr/0025-gms-domain-routing-and-trpc.md), [live authorization](../../../../adr/0026-gms-access-tokens-and-live-authorization.md), [data boundary](../../../../adr/0027-gms-master-inventory-data-and-operations.md)
- Main flow: [GMS request](../../../../diagram/gms-platform-request-flow.md)

## Boundary and current capability reuse

`backend-api-partner` already owns customer, vendor, company profile and stone master. Its current Nest controllers are private `/internal/v1/*` and gateway tRPC procedures are public via Next proxy. Proposed `api-master` **adapts that service** and hosts domain tRPC at `/api/master/trpc`; existing business logic and field contracts are reused after tests show parity. No new master service process is required merely for the name. Its `partner` and `stone` schemas stay as-is during route cutover; master schema/role consolidation is a separate, staged data migration. Stone catalog remains master-owned until a specific inventory consumer requires a read API/copy. Internal controllers retain private service-only access while public master handlers independently verify JWT, live rights and CSRF.

## Behavior

Move customer/vendor/stone/company procedures into a master router by feature. Keep current validation, running codes, optimistic conflicts and search bounds. For each migrated procedure, compare old and new outputs/errors/permission masks, then switch one frontend client. `PRICE` controls sensitive fields before serialization. New `master` DB app user may read only auth's view; partner/stone writes remain the service's responsibility. Company logo moves to `@gms/storage` only under a separately measured, checksummed file migration; until then existing bytes/path remain reachable through the approved legacy handler. See [API](api-contract.md), [authorization](authorization.md), [errors](error-handling.md), [ER](database-diagram.md).

## Capacity and rollout

Current partner cap 384 MiB/0.25 vCPU, proposed master cap 384 MiB; DB pool currently <=5, target <=10 only if PostgreSQL 40-connection budget and load allow it. Master list max 200 and <=3 DB queries/read. No heavy generation in request. Cut over customers, vendors, company and stone individually with old gateway routing retained until zero callers; Nginx route rollback must be rehearsed. Existing data rows preserve IDs; schema rename/backfill is separately gated and may be postponed indefinitely with documented exception to strict single-schema naming. Infra: [target security rev1](../../../../infra/services/gms-target/1/security.md); delivery: [DevOps rev1](../../../../devops/gms-platform-migration-rev1.md).
