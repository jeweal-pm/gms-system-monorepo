# Service architecture: auth / GMS platform migration

- Feature ID / SA revision: `gms-platform-migration` / 1; status: approved-design; see central TODO gates
- Source UI revision: none; platform migration, existing approved login/license/user-permission flows retained
- Central TODO: [GP-AUTH](../../../../task/todo/gms-platform-migration.md)
- ADRs: [routing](../../../../adr/0025-gms-domain-routing-and-trpc.md), [tokens/authorization](../../../../adr/0026-gms-access-tokens-and-live-authorization.md)
- Main flow: [GMS request](../../../../diagram/gms-platform-request-flow.md); review: [SA revision 1](../../../../reviews/sa/2026-10-20-gms-platform-migration-rev1.md)

## Domain and boundaries

Reuse `backend-api-auth`: Better Auth 1.7.7 login/session, user admin, permission matrix, EdDSA license client/cache and existing lockouts. Proposed public owner `api-auth`: Better Auth routes `/api/auth/*`, auth-owned tRPC `/api/auth/trpc`, JWKS and refresh endpoints. Auth alone writes `auth` schema and calls license-server. Existing `frontend/src/app/api/auth/[...path]/route.ts` proxy and gateway auth procedures stay until verified Nginx/direct cutover. No permanent gateway in end state. Master/inventory read a narrow auth-owned view only with SELECT privileges; internal management endpoints remain private.

## Behavior and operation

Issue a separate 15-minute access JWT and single-use rotating refresh credential after an eligible Better Auth sign-in; reject a disabled/unlicensed account per existing contracts. A Better Auth session is not a user JWT. Auth performs atomic refresh rotation and reuse/family revocation; logout/password change/deactivation expires credentials. Auth view must transactionally reflect local account/session/grant changes. The owner selected next-request license revocation when online and configurable outage handling. [ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md) approves a narrow online check per protected request. If the license-server is temporarily unreachable, `LICENSE_OFFLINE_GRACE_DAYS` is 0–2, default 2; `0` denies immediately. Grace uses only a still-valid signed eligible v2 result from the last successful check and never slides on errors. The owner approved the three-day-token v2 contract for customer code on 2026-10-20. The v2 client/policy is staged but not exposed to protected routes; external server implementation, concurrency validation and capacity remain blockers. Details: [API](api-contract.md), [authorization](authorization.md), [errors](error-handling.md), [sequence](sequence-diagram.md), [ER](database-diagram.md). Refresh does not retry ambiguously.

## Capacity and rollout

Target auth cap 384 MiB/0.25–0.30 vCPU proposed, heap 256 MiB; current cap 512 MiB. Argon2 login peak, token signing and DB pool <=5 need measured p95/RSS on production images. Stage additive tables/view and dual-path token parity; route auth through Nginx in nonproduction, then migrate clients. Keep old Better Auth cookie/session and gateway compatibility through an observation window. Rollback routes to current proxy/gateway; additive auth schema is inert. No destructive down migration. [Infrastructure research](../../../../infra/) and [DevOps proposal](../../../../devops/gms-platform-migration-rev1.md) enter final SA review when exact infra revision exists.

## Open design gate

SA revision 1 and the separate license-contract revision 2 are owner-approved for staged implementation. GP-AUTH-05 route activation still needs the external v2 server, exact private endpoint security contract, real database/concurrency integration and measured capacity. No cutover or deployment is approved.

## Ordered v2 decisions — SA revision 3 approved, staged implementation

For the user-selected [INV-20261020-001](../../../../task/investigation/INV-20261020-001-gms-license-v2-cache-order.md), [ADR-0028](../../../../adr/0028-gms-license-current-decision-order.md) is approved and its separate auth-owned current-decision table/sequence are implemented. This avoids mixing v1 cache semantics with v2 explicit denials and prevents a delayed positive response from reviving eligibility. The service resolves the immutable subject from auth's user row; the future private endpoint still requires service authentication. No new process/container was added. The sequence call and compare-and-set require 4 GB/2 vCPU load measurement before cutover. Protected routes remain on v1.
