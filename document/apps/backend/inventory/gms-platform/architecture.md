# Service architecture: inventory / GMS platform migration

- Feature/SA revision: `gms-platform-migration` / 1; status: approved-design; see central TODO gates; source UI revision: none (no inventory UI approved)
- Central TODO: [GP-INV](../../../../task/todo/gms-platform-migration.md); [SA review](../../../../reviews/sa/2026-10-20-gms-platform-migration-rev1.md)
- ADRs: [routing](../../../../adr/0025-gms-domain-routing-and-trpc.md), [authz](../../../../adr/0026-gms-access-tokens-and-live-authorization.md), [ownership](../../../../adr/0027-gms-master-inventory-data-and-operations.md)
- Main flow: [GMS request](../../../../diagram/gms-platform-request-flow.md)

## Domain and public boundary

`api-inventory` does not exist yet. Proposed Hono service owns `inventory` PostgreSQL schema, app/migration/report roles and `/api/inventory/v1/*` typed REST. Item/SKU, units, conversions, warehouse/location, lot/serial, stock documents, movements/balances and counters belong here. Existing stone master stays in master; inventory reads an owner API or approved read-only view/copy by stable ID and version, never writes master/stone. Auth provides only public JWT keys and auth-owned read-only current-authorization view. The browser reaches inventory through Nginx same origin; no gateway. No inventory UI/stock document product contract is approved yet, so initial build should be gated to selected minimal vertical slice, not all modules at once.

## Posting and operations

At most 200 document lines/post as target. Validate UUIDs, quantities as decimal strings (never JS float), item/location/lot ownership, stock permissions and license. Require Idempotency-Key for create/post. In one PostgreSQL transaction aggregate duplicate lines, insert missing balance rows, lock in stable order, guarded update nonnegative balances, append immutable movements, allocate period counter and commit document/idempotency response. On failure roll back everything; compensating movement/document corrects a posted entry. No cross-service transaction or cross-schema FK. Period computed Asia/Bangkok. Reads max 200 and <=3 queries; post <=10 batched queries regardless of line count. Heavy exports/reports use worker only after exact job feature and capacity approval. See [API](api-contract.md), [ER](database-diagram.md), [errors](error-handling.md), [sequence](sequence-diagram.md).

## Capacity, rollout and rollback

Proposed inventory cap 256 MiB/heap 192 MiB, DB pool <=10. Pg max_connections 40 budget reserves 5 auth +10 master +10 inventory +5 worker =30. Worker/Redis are separate later gates; do not provision without selected heavy workflow. Stage PG16-compatible schema/role migration as one-off job, seed no customer stock by guess, verify existing master identifiers through owner API, then release selected read/write route. A posted document is durable; rollback of application image must preserve append-only rows and compatible schema, with operator reconciliation for any partially handled async job. Infra [security rev1](../../../../infra/services/gms-target/1/security.md) and DevOps [delivery rev1](../../../../devops/gms-platform-migration-rev1.md) are prerequisites; no production fit claimed without measurement.
