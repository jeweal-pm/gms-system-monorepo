# Sequence diagram: mounted master auth boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Main flow: [GMS master auth boundary](../../../../../diagram/gms-master-auth-boundary-flow.md)

```mermaid
sequenceDiagram
    actor U as Browser
    participant N as Nginx
    participant M as Partner process / master tRPC
    participant J as Auth JWKS
    participant V as Auth read-only view
    participant A as Auth private license endpoint
    participant L as Local mock license client
    participant P as Partner customer/vendor DB
    U->>N: Same-origin tRPC + cookie + mutation CSRF
    N->>M: /api/master/trpc (only public mount)
    alt Invalid mutation CSRF
      M-->>N: 403 before JWT/JWKS, view, license or domain call
    else CSRF valid or safe read
      M->>J: Verify JWT key (bounded cache)
      M->>V: SELECT current user/session through MASTER_AUTHZ_DATABASE_URL reader role
      alt Missing, inactive, expired or DB failure
        M-->>N: 401/503; no domain call
      else Current row
        M->>A: Private POST with dedicated service token + userId/sessionId
        A->>V: Recheck exact live session/account
        A->>L: Check license using auth-resolved immutable subject
        L-->>A: Mock v2 signed proof/denial/outage in local/test only
        A-->>M: Minimal decision, no token
        alt Denied or unknown
          M-->>N: 403/503; no domain call
        else Eligible
          M->>M: Check exact grant and typed input
          M->>P: Customer/vendor service call
          P-->>M: Result
          M-->>N: tRPC result
        end
      end
    end
    Note over N,A: Nginx denies /internal/*; auth-master network is separate and not attached to Nginx
```

No production license-server endpoint is included. Legacy gateway path remains available for rollback until separately approved parity/cutover.
