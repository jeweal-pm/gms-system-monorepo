# Sequence diagram: private current-license boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Main flow: [GMS master auth boundary](../../../../../diagram/gms-master-auth-boundary-flow.md)
- Related TODOs: GP-AUTH-05/06, GP-MASTER-01/02; selected ticket INV-20261021-006 r1.

```mermaid
sequenceDiagram
    participant N as Nginx public ingress
    participant M as partner process / master tRPC
    participant J as auth JWKS
    participant V as PostgreSQL auth.current_authorization
    participant A as auth private API
    participant U as PostgreSQL auth.User + license decision
    participant L as local mock license client
    participant D as PostgreSQL partner schema
    M->>J: GET JWKS when bounded cache expires
    M->>M: Verify cookie JWT issuer/audience/expiry
    alt Cookie-authenticated mutation with invalid origin or CSRF marker
      M-->>N: 403 CSRF_INVALID before DB/license/domain call
    else Valid CSRF or safe read
      M->>V: SELECT by JWT sub + sid with read-only role
      alt View unavailable, inactive account or expired/mismatched session
        M-->>N: 503 or 401; no domain call
      else Current session
        M->>A: POST /internal/v1/license/current + dedicated service bearer + userId/sessionId
        A->>A: Constant-time caller credential check and strict body validation
        A->>V: Recheck exact user/session, active and expiry
        A->>U: Resolve immutable username and current license decision
        A->>L: V2 refresh; mock only in local/test
        L-->>A: Signed v2 proof/denial or test outage
        A-->>M: Eligible VALID/EXPIRING/GRACE, or 401/403/503; never token bytes
        alt License denied/unavailable
          M-->>N: 403/503; no domain call
        else License eligible
          M->>M: Check live grant and procedure input
          M->>D: Customer/vendor domain operation
          D-->>M: Bounded domain result
          M-->>N: tRPC result
        end
      end
    end
    Note over N,A: Nginx rejects /internal/* and is not attached to the dedicated auth-master network
```

The real external license-server is outside this proposal. The mock is only local/test configuration and is rejected in production. No client retry occurs on uncertain outcome.
