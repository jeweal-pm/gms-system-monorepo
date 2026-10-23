# Sequence diagram: inventory / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; main flow: [GMS request](../../../../diagram/gms-platform-request-flow.md); TODO GP-INV-01..05

```mermaid
sequenceDiagram
    actor U as Browser
    participant N as Nginx same origin
    participant I as api-inventory Hono
    participant K as Local JWT public-key cache
    participant A as auth read-only view
    participant L as auth private license check
    participant D as inventory PostgreSQL
    U->>N: POST /api/inventory/v1/documents/{id}/post + Idempotency-Key + CSRF
    N->>I: Trusted route/request ID
    I->>K: Verify access JWT locally
    I->>A: Indexed active session/grant check
    I->>L: Fresh remote license decision or bounded signed outage fallback
    alt Invalid/denied/unavailable authorization
      I-->>U: 401/403/503; no transaction
    else Authorized
      I->>D: BEGIN; reserve idempotency key and request hash
      alt Same key same request already committed
        D-->>I: Stored result
        I-->>U: Same result
      else Same key different request
        D-->>I: Conflict
        I-->>U: 409
      else New request
        I->>D: Aggregate lines; ensure balance rows; lock ordered rows
        I->>D: Guarded balance updates; append movements; counter; commit
        alt Insufficient stock or invalid reference
          D-->>I: ROLLBACK
          I-->>U: 409 with safe failing line IDs
        else Committed
          D-->>I: Document number and balance result
          I-->>U: 200 posted document
        end
      end
    end
```

`L` is a proposed GMS §2 exception under the [offline license policy](../../../../spec/gms-license-offline-policy.md); explicit remote revocation denies immediately, while transient outage fallback defaults to two days and never slides. No automatic retry of an ambiguous post. Client may query the idempotency key/result before resending the **same** body. Heavy export later returns 202/job ID and is not part of the first stock-post transaction.
