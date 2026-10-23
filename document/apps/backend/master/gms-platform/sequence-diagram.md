# Sequence diagram: master / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; main flow: [GMS request](../../../../diagram/gms-platform-request-flow.md); TODO GP-MASTER-01..04

```mermaid
sequenceDiagram
    actor U as Browser
    participant N as Nginx same origin
    participant M as api-master tRPC
    participant A as auth JWKS cache
    participant V as auth read-only view
    participant L as auth private license check
    participant D as master-owned PostgreSQL schema
    U->>N: POST /api/master/trpc/customer.save + cookies + CSRF
    N->>M: Forward trusted request and request ID
    M->>A: Verify JWT signature locally using cached public key
    M->>V: Indexed current user/session/grant read
    M->>L: Fresh remote license decision or bounded signed outage fallback
    alt Missing or invalid token/grant/license/CSRF
      M-->>U: 401/403 or activation state; no write
    else Auth view/JWKS/license evidence unavailable
      M-->>U: 503 fail closed; no write
    else Authorized
      M->>D: Transaction: existing customer validation/code/version rule
      alt Duplicate/version conflict
        D-->>M: Rollback conflict
        M-->>U: 409 stable domain error
      else Committed
        D-->>M: Bounded result
        M-->>U: Existing typed result; PRICE masked if no grant
      end
    end
```

`A` is a *locally cached public key*. `L` is a proposed narrow per-request license exception to GMS §2; it uses [offline policy](../../../../spec/gms-license-offline-policy.md) with default two-day grace and cannot guarantee remote revocation during an outage. The current legacy path is browser -> Next `/api/trpc` -> gateway -> partner `/internal/v1/*` until parity/cutover. Both paths must be observable by request ID without logging cookie/token.
