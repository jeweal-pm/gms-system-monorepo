# GMS platform request and migration flow (proposed, SA revision 1)

Source: [GMS spec v1.1](../gms-platform-spec.md); [ADR-0025](../adr/0025-gms-domain-routing-and-trpc.md), [ADR-0026](../adr/0026-gms-access-tokens-and-live-authorization.md). No UI revision selected. This is an architecture flow, not a replacement for the accepted [login](login-flow.md), [license](license-flow.md), or existing feature flows until cutover is approved.

```mermaid
flowchart TD
    B[Browser one GMS origin] --> N[Nginx TLS and routing]
    N -->|other paths| F[Next frontend]
    N -->|/api/auth/*| A[api-auth Better Auth plus auth tRPC]
    N -->|/api/master/*| M[api-master domain tRPC]
    N -->|/api/inventory/*| I[api-inventory REST v1]
    A -->|own writes| AD[(auth schema)]
    M -->|own writes| MD[(master schema after migration)]
    I -->|own writes| ID[(inventory schema)]
    M -->|read-only authz view| AV[(auth-owned authorization view)]
    I -->|read-only authz view| AV
    A -->|fresh status for each protected request, proposed| L[license-server]
    I -->|heavy job after approval| Q[Redis queues]
    Q --> W[worker]
    W -->|owning service scoped operations| ID
    A --> S[storage interface]
    M --> S
    I --> S
    S --> FS[fs default or approved S3 profile]
```

1. Login continues through Better Auth; auth issues distinct short access JWT and rotating refresh credential after eligibility checks.
2. A protected request verifies the JWT locally in its domain API and reads current account/session/grants from the auth-owned read-only view. The proposed license path asks auth for a fresh signed remote decision. Explicit revoked/expired state denies. On a transient outage, auth may use the last signed eligible result only until the earlier of its expiry or the fixed last-success timestamp plus `LICENSE_OFFLINE_GRACE_DAYS` (0–7, default 2); otherwise it returns 503. Remote revocation during an outage may remain unknown within that bound. This revises the current seven-day grace only after the ADR/spec exception and remote contract are approved.
3. Domain API validates input, authorizes exact action, executes its own schema transaction, returns bounded data and a common error envelope. Nginx adds request ID; frontend never treats menu visibility as authorization.
4. Before cutover, the legacy Next proxy/gateway path remains usable for rollback. Move one domain procedure/client at a time. Remove legacy routes only after parity, capacity and rollback are recorded.

The owner selected next-request local and online-remote revocation, then requested configurable outage handling with a two-day default on 2026-10-20. The architecture is still a proposed SA revision. [Auth sequence](../apps/backend/auth/gms-platform/sequence-diagram.md), [master sequence](../apps/backend/master/gms-platform/sequence-diagram.md), [inventory sequence](../apps/backend/inventory/gms-platform/sequence-diagram.md) show error paths.
