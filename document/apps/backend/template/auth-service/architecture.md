# Service architecture: <service> / <feature>

- Feature ID / SA revision: <feature> / <revision>
- Source UI revision / TODO: <revision and link>
- Status: draft
- ADRs / main flow / review bundle: <links>

## Domain and service boundaries

Identify service ownership, existing capability reuse, gateway/proxy boundary, public
interface, owning PostgreSQL schema, and cross-service dependencies. Do not infer transport
from the template's auth-service name; inspect the implementation and accepted ADRs.

## Behavior and operation

Describe business rules, transactions, consistency, timeouts, retries/idempotency, logging,
and integration. Link authorization, API, sequence, database, and error documents.

## Capacity and rollout

Estimate aggregate CPU/RAM, connections, query/pagination limits, concurrency, cache bounds,
and Docker changes on 8 GB RAM / 4 vCPU with host headroom. Record migration/backfill/rollback,
compatibility, measurement gaps, and proposed dependencies/ADRs.

## Container infrastructure

When changing services/images/networks/storage, link the exact infra security bundle
prepared through `document/workflow/infra-delivery.md`, its official research, required
traffic/egress, writable paths, secret/DB-adapter dependencies, capacity and rollout checks.
Include it in the SA review before dependent container configuration. Unchanged service
configuration can reuse still-valid evidence.
