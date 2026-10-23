# ADR-0028: Order GMS license decisions across concurrent requests

- Status: Accepted for scoped backend implementation; production cutover still gated
- Date: 2026-10-20
- Feature / source UI revision: `gms-platform-migration` / none
- SA revision: license decision ordering revision 3
- Deciders: project owner
- Approval evidence: owner reply "อนุมัติ SA revision 3 และ ADR-0028" on 2026-10-20 to the exact SA revision 3 / ADR-0028 review question
- Selection evidence: owner approved remediation of [INV-20261020-001](../task/investigation/INV-20261020-001-gms-license-v2-cache-order.md) on 2026-10-20; that approval does not approve this new schema/flow design
- Related: [ADR-0013](0013-per-user-license-with-signed-token.md), [ADR-0026](0026-gms-access-tokens-and-live-authorization.md), [license contract revision 2](../spec/gms-license-server-contract-rev2.md), [SA review](../reviews/sa/2026-10-20-gms-license-ordering-rev3.md)

## Context

The staged v2 customer client checks license-server once per protected request. The existing `auth.LicenseCache` stores the last signed proof. A slow active response can write after a newer 404/revoked decision and revive an old positive cache before an outage. The code is not wired to a protected route, but this must be resolved before GP-AUTH-05 activation. The method also takes user ID and immutable license subject separately; the future private endpoint must bind them to the authenticated principal.

## Decision

Auth owns a separate `auth.LicenseCurrentDecision` row per user for the GMS v2 path. Keep the v1 `LicenseCache` unchanged for rollback. Add a PostgreSQL sequence `auth.LicenseCurrentCheckOrder`; obtain one order value **before** each remote call without holding a transaction or pool connection during network wait. On an online answer, atomically upsert the decision only when the stored order is smaller. Store database `NOW()` for a verified active decision and its signed token; store a denial marker with no token for 404, revoked/suspended/expired, invalid proof, 4xx or 429. An older active answer that loses the compare-and-set returns fail-closed 503 and cannot overwrite the newer denial. Outages do not advance the order or successful timestamp; fallback reads only the latest active row and checks signed v2 identity, natural expiry, token expiry and configured 0–2-day deadline with database time.

`LicenseCurrentDecision` columns: `user_id` text primary/foreign key to `auth.User` with cascade delete, `last_check_order` bigint not null, `state` varchar(8) check `ACTIVE|DENIED`, `signed_token` text nullable, `successful_at` timestamptz nullable, `decided_at` timestamptz not null. Check constraint requires token and successful time only for `ACTIVE`. The sequence is global, monotonic and need not be gap-free. No new library or container is proposed. The private endpoint must authenticate its service caller and resolve the immutable subject from the local user row or verify an exact ID/subject binding before calling the method; a caller-provided pair is never authoritative by itself.

The license-server mock remains the development source. Its opt-in v2 token already has `contract_version: 2` and three-day expiry. The separate real license-server repository remains outside this scope, as the owner directed on 2026-10-20.

## Alternatives

Keeping only `LicenseCache` with delete-on-404 cannot preserve denial ordering. A per-process mutex fails across replicas and restarts. Holding a PostgreSQL advisory or row lock across the 1,500 ms remote call consumes scarce pool slots on the 4 GB / 2 vCPU host. A signed monotonic revision supplied by license-server would require an unapproved external contract change. A separate sequence/table provides cross-process ordering without a long-lived DB connection and leaves v1 cache semantics intact.

## Consequences and capacity

At most one current-decision row per user plus one sequence value per online request; primary-key lookup and compare-and-set use bounded queries, with no in-memory per-user queue and no transaction held during network IO. The extra DB sequence call and write on every reachable protected request must be load tested with the current pool maximum and 4 GB / 2 vCPU host before cutover. Versioned migration creates the sequence/table without copying v1 positive cache: a v2 outage before its first verified online success denies. Rollback uses the old routes and v1 cache while leaving the additive table inert. A later cleanup requires separate approval. No existing account/license transfer behavior changes.

## Acceptance and approval

Unit and isolated PostgreSQL integration tests must force active→404 and active→revoked responses to complete out of order across two service instances; the final row remains denied, and a subsequent outage cannot enter grace. Test a later valid reactivation, identity mismatch, invalid proof, 429, no initial row, 0/1/2-day deadlines and database failure. Run the auth suite, typecheck/build/lint, then both scoped security reviews against one final source revision. GP-AUTH-05 remains open until mock private-route authorization and external capacity/cutover prerequisites are separately resolved.

The owner approved this ADR and the exact [SA revision 3 bundle](../reviews/sa/2026-10-20-gms-license-ordering-rev3.md) on 2026-10-20 for scoped backend code and migration. This approval does not activate the private route or authorize deployment.
