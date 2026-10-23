# ADR-0031: Private master authorization and license boundary

- Status: Accepted for implementation within the exact scope recorded in SA review revision 1
- Date: 2026-10-21
- Feature / source UI revision: `INV-20261021-006-r1` / none
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner explicitly instructed on 2026-10-21 to proceed with the currently identified work without waiting for further approval; recorded in [SA review revision 1](../reviews/sa/2026-10-21-gms-inv006-auth-boundary-rev1.md). A later owner instruction separately selects the naming-only partner-to-master adaptation already allowed by ADR-0025/0027. It does not authorize gateway removal, schema/data migration, production license-server work, push, or production cutover.
- Required infrastructure evidence: [GMS master auth boundary infra revision 1](../infra/services/gms-master-auth-boundary/1/security.md), SHA-256 `2A8939CA682FEAC5551E2D469F2CFC945A53B06473378B66DCFC38348478217D` (research-only; Docker Desktop source/runtime snapshot 2026-10-21 07:28 UTC, Docker 25.0.3, Compose v2.24.6-desktop.1, Linux/amd64; no config validation/runtime changes).
- Related: [ADR-0025](0025-gms-domain-routing-and-trpc.md), [ADR-0026](0026-gms-access-tokens-and-live-authorization.md), [ADR-0028](0028-gms-license-current-decision-order.md), [INV-006 SA review](../reviews/sa/2026-10-21-gms-inv006-auth-boundary-rev1.md)

## Context

The selected INV-20261021-006 revision 1 found that staged master auth context is unmounted, CSRF is represented in context but not yet proven to reject before domain calls, private current-license service auth is not implemented, and the master runtime DB role/view-only access is unverified. ADR-0025/0026 already approve domain-owned tRPC, a live auth view and per-request license policy, and ADR-0028 orders auth license decisions. This ADR fills the missing private caller, DB-role and mount-order contract without changing license-server v2 or the grace policy.

## Decision

1. Auth exposes one private `POST /internal/v1/license/current` for the current master process only, over a dedicated internal auth-master network not attached to Nginx. Nginx denies `/internal/*`. The attached infra research finds auth is multihomed and bridge membership is not a source ACL; the application token is normative on every auth interface. No public host publication may bypass this boundary in the target profile. The cited infra bundle is research only, not Compose/config validation or runtime evidence, and its source snapshot predates finalization of this SA package.
2. Authenticate the caller using a dedicated high-entropy `MASTER_AUTH_SERVICE_TOKEN`, constant-time compared, separate from `PARTNER_SERVICE_TOKEN`, CRM and Better Auth secrets, delivered only to auth/master runtime and excluded from logs. The secret is mounted read-only at `/run/secrets/master_auth_service_token`; only `MASTER_AUTH_SERVICE_TOKEN_FILE` path is configured in the environment. Backend implements the strict file reader; no environment-value fallback is allowed. The host source is outside the repository/build context. Request is strict `{userId,sessionId}`; auth re-reads exact active/unexpired auth view membership and resolves immutable license subject from auth's own User row. It returns only minimal eligible status/deadline, never token material. Endpoint is no-cache/no-retry, 1.9s server deadline, with 2.0s caller timeout and 1.5s existing upstream timeout. Known denial is 403; any unknown/unavailable proof is 503.
3. The mounted master tRPC context must reject invalid mutation Origin/CSRF immediately, before JWT/JWKS, auth view/license lookup and before any domain service call. It then verifies JWT, reads the fresh auth view, calls private license decision, checks exact grants/input, and only then invokes a domain service. Existing router guards remain defense in depth. Public route is only `/api/master/trpc`; internal REST routes remain protected by existing partner service-token guard.
4. Master authorization reads use a **separate** `MASTER_AUTHZ_DATABASE_URL` and dedicated non-owner `gms_master_authz_reader` DB login. It has database connect, `USAGE` on auth, and `SELECT` only on `auth.current_authorization`; it has no partner/stone/auth base-table/license/refresh/sequence/function/migration access, no create, ownership, broad membership or bypass privilege. The current partner process also continues serving legacy company-profile/stone and partner-owned procedures; its existing `PARTNER_DATABASE_URL` and Prisma client therefore remain unchanged and separate from the auth reader. Auth schema owner/migration credentials remain separate. The auth-view reader uses its own Prisma client and pool of at most one.
5. No schema table/view change, new package, new process, or production license-server implementation. Mock license signing is permitted only for local/test; production continues to reject mock mode. `LICENSE_OFFLINE_GRACE_DAYS` 0–2 default 2 and the approved v2 response semantics stay unchanged.
6. Rollback unmounts the master tRPC route and restores the existing Next/gateway route, disables private credential and revokes dedicated DB grants/login; all user/business/license data and additive auth tables remain intact. Route activation, service rename, deployment and gateway removal require their separate parity and deployment gates.

## Alternatives

| Alternative | Decision |
|---|---|
| Reuse `PARTNER_SERVICE_TOKEN` | Reject: grants a credential with wider gateway-to-partner purpose to another boundary and impairs rotation/isolation. |
| Accept caller-provided username/license subject | Reject: caller could mismatch a valid user ID with another license identity. |
| Give master shared `f1_user`/auth schema access | Reject: cannot demonstrate view-only least privilege and couples service compromise to auth storage. |
| Rely on router procedure middleware to reject CSRF | Reject: request context currently performs auth/license work before procedure middleware; mutation must stop before any downstream service call. |
| Call production license server from master | Reject: auth alone owns signed token validation and v2 ordering; real external server remains deferred. |

## Consequences and capacity

No additional process or package. Existing auth/partner caps remain 512/384 MiB and 0.30/0.25 vCPU; existing partner pool remains <=5 and new auth-view reader pool <=1, within ADR-0025's target master pool allowance of 10. The check adds one bounded internal call and current auth-side DB/license decision work; no DB connection is held over network IO. Measure mounted path p95, cold/warm JWKS, DB waits and RSS on the actual 4 GB RAM / 2 vCPU host before cutover. Infra must research the changed private network, Nginx-to-master routing, separate reader secret injection and host-port restrictions and include a versioned bundle in final review. Additive grants/credentials can be revoked without data rollback. No container deployment is authorized.

## Acceptance and approval

This ADR covers both service delta bundles under `document/apps/backend/{auth,master}/gms-platform/inv006-*-license-boundary/`, the private endpoint and DB privilege contract, mounted CSRF order, [main flow diagram](../diagram/gms-master-auth-boundary-flow.md), and the exact [infra research revision 1](../infra/services/gms-master-auth-boundary/1/security.md) with SHA-256 `2A8939CA682FEAC5551E2D469F2CFC945A53B06473378B66DCFC38348478217D`. Required evidence: real mounted HTTP/tRPC tests showing every CSRF denial occurs before auth/license/domain calls; isolated DB test role positive and negative privileges; auth endpoint caller/session binding and mock-only license cases; timeout/fail-closed cases; Nginx/private-network review; legacy rollback test; full tests/build/lint/typecheck; both scoped security reviewers on the same final source. This exact bundle was approved for implementation by the owner on 2026-10-21; unrelated contract and migration changes remain out of scope.
