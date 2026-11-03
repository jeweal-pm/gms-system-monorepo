# Service architecture: master / decimal-setup

- Feature ID / SA revision: `decimal-setup` / 1
- Source UI revision / TODO: UI rev 2 (parent, in preparation) / [decimal-setup.md](../../../../task/todo/decimal-setup.md) revision 2
- Status: **pending-review** (2026-11-03)
- ADRs / main flow / review bundle: [ADR-0040](../../../../adr/0040-global-decimal-setup.md), [decimal-setup-flow](../../../../diagram/decimal-setup-flow.md), [decisions](decisions.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md)

## Domain and service boundaries

- **Owner:** `backend-api-master`, new module `src/decimal-setup/` (schemas, errors, service), same shape as `src/document-setup/`.
  Data in schema `partner` (owned by master, ADR-0027). Reuses: `prisma` client, `WRITE_TX`, `partnerException`,
  `isPrismaUnavailable`/`prismaCode`, tRPC `domainCall` mapping, ADR-0031 authorization context.
- **Public interface:** browser → Next same-origin `/api/master/trpc` → nginx → master tRPC `decimalSetup.get|save`. No REST.
- **Auth service:** only the static permission catalog changes (`backend-api-auth/src/permission/catalog.ts`). Master reads
  grants from `auth.current_authorization` as today; no new cross-service call.
- **Consumers:** every frontend page that shows or enters weight/money (quotation, reserve, memo receive/return/out/out return,
  memo stock modals, memo outstanding vendor report and print). No backend domain reads the setting (SA-DEC-05).

## Behavior and operation

- **get:** `findUnique({ where: { id: 1 } })`. If the seed row is missing (manual DB edit), return defaults
  `{weightPlaces: 2, pricePlaces: 2, version: 0, updatedAt: epoch ISO, updatedBy: null}` and log `decimal_setup.row_missing` (warn).
- **save:** zod strict input; in one `WRITE_TX` transaction:
  `expectedVersion = 0` → `create` id 1 (P2002 → `DECIMAL_SETUP_CHANGED`); otherwise
  `updateMany({ where: { id: 1, version: expectedVersion }, data: { …, version: { increment: 1 }, updatedBy, updatedAt } })`,
  count 0 → `DECIMAL_SETUP_CHANGED`. Return the saved row. Always bumps the version (the UI disables Save when unchanged).
- **Logging:** `decimal_setup.updated` `{actorId, version, weightPlaces, pricePlaces, previousWeightPlaces, previousPricePlaces}`.
  No PII beyond actor id.
- **Rounding rule for display (frontend):** half-up on the exact decimal string (existing bigint `toFixed`), thousands separator,
  exactly N fraction digits (N = setting). Inputs cap new keystrokes at N; values already stored with more places are shown
  unchanged in an edit field until the user edits that field (no silent rewrite). See Q-DEC-10/18.
- **Timeouts/retries:** reads are idempotent (React Query retry 1); save is not retried automatically. `WRITE_TX` 4 s / maxWait 2 s.

## Capacity and rollout

- Load: one PK read per app load per user plus a refetch on focus after 10 minutes stale; one single-row write per save.
  Table size: 1 row. No new pool, cache, index, job or container. ADR-0024 budget unchanged.
- Rollout order: BE-DEC-004 (auth catalog) and BE-DEC-001…003 (master) can deploy together; frontend FE-DEC-101…106 after the
  master contract is live. Frontend falls back to 2/2 if the endpoint is absent, so order mistakes are harmless.
- Migration: additive create + seed; rollback = drop table (no FKs reference it). See [database-diagram](database-diagram.md).
- Measurement gaps: none needed.

## Container infrastructure

Not applicable: no service, image, network, volume, writable path, egress, secret or variable change. No infra bundle and
no devops handoff are required beyond the normal rebuild of the existing `backend-api-master`, `backend-api-auth` and
`frontend` images.

## Upload / storage

Not applicable: the module stores no files; `@gms/storage` is not involved.
