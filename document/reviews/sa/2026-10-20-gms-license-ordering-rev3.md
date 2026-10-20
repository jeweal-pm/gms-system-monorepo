# SA revision 3 review — order concurrent GMS license decisions

- Date: 2026-10-20 (Asia/Bangkok)
- Status: **owner approved for scoped backend schema/decision-ordering implementation**; private route and production cutover still gated
- Feature: `gms-platform-migration`; TODO GP-AUTH-05; source UI revision: none
- Investigation: [INV-20261020-001 revision 1](../../task/investigation/INV-20261020-001-gms-license-v2-cache-order.md), selected by owner reply "อนุมัติแก้ INV-20261020-001" on 2026-10-20
- Prior approvals: [GMS SA revision 1](2026-10-20-gms-platform-migration-rev1.md) and [license contract revision 2](2026-10-20-gms-license-contract-rev2.md). The ticket selection does not approve the new schema or flow.
- Accepted ADR: [ADR-0028](../../adr/0028-gms-license-current-decision-order.md)
- Exact service bundle revisions for approval: [architecture](../../apps/backend/auth/gms-platform/architecture.md), [authorization](../../apps/backend/auth/gms-platform/authorization.md), [sequence](../../apps/backend/auth/gms-platform/sequence-diagram.md), [database diagram](../../apps/backend/auth/gms-platform/database-diagram.md), [API contract](../../apps/backend/auth/gms-platform/api-contract.md), [errors](../../apps/backend/auth/gms-platform/error-handling.md), [dependencies](../../apps/backend/auth/gms-platform/dependencies.md), [testing](../../apps/backend/auth/gms-platform/testing.md), and [central TODO](../../task/todo/gms-platform-migration.md)

## Approved decision

Approve a separate auth-owned `LicenseCurrentDecision` table plus PostgreSQL sequence. Each online v2 request gets a database order before the bounded HTTP call. Its verified active or denied result is stored only if newer than the prior decision. A slow old active result that loses the compare-and-set returns 503 and never authorizes. An outage reads only the newest signed active result and uses the existing fixed 0–2-day policy. Explicit 404/revoked/expired, invalid proof and upstream 4xx/429 persist denial so a later outage cannot revive an older positive proof. The v1 `LicenseCache` remains untouched for rollback. The future private endpoint must authenticate its service caller and bind user ID to the immutable license subject in auth's database; its exact transport remains a separate activation gate.

No new service, image, package, lockfile or external license-server work is in this revision. The owner directed mock-only development for now; the real license server will live in another repository. The approved three-day token and 0–2-day grace do not change. This revision adds one sequence read and one compare-and-set write per reachable protected request, with no database transaction held across the 1,500 ms network wait. Keep one row/user, existing pool bounds and 4 GB/2 vCPU headroom; measure load before cutover.

## Migration and verification

Expand the auth schema with the new table, sequence, FK and state/token check constraint. Do not backfill old v1 positives; an outage before first v2 online success denies. Rollback selects old routes and leaves the additive table inert. Backend owns migration/service/tests with parent serialization of Prisma schema/migrations. Unit and isolated PostgreSQL integration must prove out-of-order active/404 and active/revoked responses across separate service instances, later reactivation, denial persistence, identity mismatch and grace boundaries. Then run full auth checks and two scoped security reviews against the final source. The existing isolated sequential PostgreSQL suite passes 50/50 auth tests but does not prove ordering. GP-AUTH-05 remains open for private endpoint authentication and production external-server/capacity validation even after this remediation.

Implementation evidence after approval: the additive migration applied as migration 8/8 on disposable PostgreSQL 18.6. Out-of-order active/404 and active/revoked integration passed across two service instances; full auth suite passed 54/54 with one worker, plus typecheck/build/lint. [Verification detail](../../apps/backend/auth/gms-platform/testing.md) and [handoff](../../coordination/handoffs/gms-license-v2-ordering-backend.md) record the final source hash. Private endpoint and production cutover remain open.

## Approval evidence

- Approval of this SA revision: owner reply "อนุมัติ SA revision 3 และ ADR-0028" on 2026-10-20 to the exact review question
- Owner selection of investigation: received 2026-10-20; recorded in the ticket
- Decision: approved this exact ADR-0028 and linked SA revision 3 bundle for backend migration and ordering code. This is not deployment approval.
