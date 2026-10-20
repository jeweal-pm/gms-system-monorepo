# ADR-0027: GMS master, inventory, storage and background work boundaries

- Status: Accepted for staged implementation; first inventory slice separately gated
- Date: 2026-10-20
- Feature / source UI revision: `gms-platform-migration` / none
- SA revision: 1
- Deciders: project owner
- Approval evidence: 2026-10-20 owner reply "อนุมัติ SA revision 1 และเริ่มงานที่ไม่ติด blocker" to the linked SA review
- Related: [ADR-0018](0018-customer-master-partner-service.md), [ADR-0019](0019-vendor-master.md), [ADR-0021 company profile](0021-company-profile-in-partner-service.md), [ADR-0024 stone](0024-stone-master-in-partner-service.md), [GMS spec](../gms-platform-spec.md)

## Context

Today `backend-api-partner` owns `partner` (customer, vendor, company) and `stone` schemas. GMS v1.1 assigns general masters to master, stock-tied SKU/units/locations/lots and postings to inventory, with per-service schema/DB role, bounded jobs, and storage abstraction. No inventory API or data exists in this checkout. Existing stone lookups might be used in inventory later but are currently not stock transactions.

## Decision

1. Adapt the existing partner service into `api-master` at the route/process boundary first, preserving its `partner`/`stone` tables and record IDs. Run an explicit expand/backfill/cutover/contract migration to `master` ownership only after row counts, checksums, foreign keys and full API parity are proven. One service remains writer during each phase; no dual writes or cross-schema foreign keys. Existing stone tables remain master-owned until a *specific stock use* requires a narrow immutable identifier/read API or versioned local inventory copy. Do not move all stone data speculatively.
2. New inventory service owns `inventory` schema/role and typed REST v1 under `/api/inventory/v1`. Its initial domain is item/SKU, unit, location, lot, document, append-only stock movement, balance, doc counter and idempotency key. Posting uses one transaction with deduplicated lines, stable balance-row lock order, nonnegative guarded updates, movement insert and gap-free per-document-period counter. Period is Asia/Bangkok. Use `numeric`, UUIDv7 in app with PG16-compatible fallback, `UNIQUE NULLS NOT DISTINCT` for nullable lot. Same code for db-local and db-managed, TLS `verify-full` for managed, portable migrations and transaction-pooler-safe SQL.
3. `@gms/storage` is a *proposed* shared package interface with fs default. Service-owned metadata lives in its schema; bytes never in PostgreSQL. Existing company logo requires a planned, checksummed file migration from its current path to `public/master/...` without changing its identity/permission behavior. New uploads stream with 20 MB default cap and magic-byte validation, use service prefix and expiring user-bound HMAC URL (fs) or presigned URL (S3), and require confirmation before ready status. Nginx serves protected fs downloads only after domain API authorization via `X-Accel-Redirect`; no directory exposure. Storage deletion is soft 30 days; documents immutable; exports 7-day default TTL. S3/Garage remains a separate profile decision, not an automatic default.
4. Redis/BullMQ worker is introduced only for an approved heavy feature: >2 s, >1000 rows, file generation except <1 s single PDF, >50 MB expected memory, external call or many stock locks. Two queues (`fast` concurrency 2, `heavy` concurrency 1), max two pending jobs/user, explicit timeout, bounded retry, idempotent job ID, no unbounded in-memory export. Do not provision Redis/worker merely to satisfy a diagram before a chosen feature and measured capacity.
5. Auth alone owns user/licensing; master/inventory read an auth-owned authorization view under [ADR-0026](0026-gms-access-tokens-and-live-authorization.md). Cross-service reads go through owner API or explicitly granted read-only views. Each service writes only its schema. Internal calls use service credentials and verified caller claims, with bounded timeouts; actor ID cannot come from an untrusted header. Permission key mapping for each new inventory action requires owner-approved catalog entries before release.

## Alternatives

| Alternative | Reason deferred |
|---|---|
| Rename all `partner`/`stone` schemas immediately | High-risk migration with no user-facing gain; staged migration preserves rollback. |
| Keep stock in master | Couples stock transaction locks and document numbering to general masters and violates GMS ownership. |
| Add Redis/worker/S3/Garage immediately | Expands resource/security surface before a selected heavy workflow or storage profile exists. |

## Capacity, migration and rollback

Default db-local+fs target memory caps nominally total 3040 MiB plus OS ~500 MiB, leaving ~556 MiB; cpu, RSS and I/O must be proven under load. DB max_connections=40, planned pools 30 total, with migrations run one at a time. Lists max 200 rows; list/read <=3 DB round trips and post <=10 (batched), bounded by spec p95. Expand schema and preserve old reads; backfill in bounded batches with checkpoint; compare counts/checksums and new/old API responses; switch router path atomically; preserve read-only old tables until rollback window expires; contract only after owner release approval. A posted stock document is never undone by schema rollback; corrections use compensating movements. Backup/restore must cover database plus files consistently.

## Acceptance and approval

The owner approved this ADR's *design*, [master](../apps/backend/master/gms-platform/architecture.md) and [inventory](../apps/backend/inventory/gms-platform/architecture.md) bundles in [SA revision 1](../reviews/sa/2026-10-20-gms-platform-migration-rev1.md) on 2026-10-20 for nonblocked work. S3/Garage customer profile, precise stock forms, package versions, exact schema consolidation and actual rollout require follow-on approved scoped revisions. Confirm the initial inventory feature, storage profile and queue trigger before their dependent implementation. No inventory service or rollout is authorized merely by this boundary decision.
