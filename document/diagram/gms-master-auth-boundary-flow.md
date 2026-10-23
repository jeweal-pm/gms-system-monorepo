# GMS master authorization boundary (INV-006 SA revision 1 draft)

This diagram documents the owner-approved SA revision 1 security boundary for customer/vendor tRPC mounting. It is the implementation contract, not an implementation claim. The router is being mounted in the selected scope; legacy Next/gateway path remains the rollback route.

```mermaid
sequenceDiagram
    actor U as Browser
    participant N as Nginx
    participant M as Master tRPC
    participant V as auth.current_authorization
    participant A as Auth private license endpoint
    participant L as Development mock only
    participant P as Existing partner customer/vendor data
    U->>N: Same-origin request with access cookie
    N->>M: /api/master/trpc
    M->>M: Verify JWT
    alt Mutation without valid Origin/CSRF
      M-->>U: 403; stop before auth/license/domain services
    else Safe read or valid mutation
      M->>V: Read live user/session/grants via scoped DB role
      M->>A: Per-request decision with userId + sessionId
      A->>V: Recheck live session, active account and expiry
      A->>L: Validate current license through auth-owned client
      A-->>M: Minimal eligible/denied/unavailable result
      alt Any auth/license/grant failure
        M-->>U: 401, 403 or 503; no domain service call
      else All gates pass
        M->>P: Customer/vendor operation
        P-->>M: Bounded result
        M-->>U: Typed tRPC response
      end
    end
```

For a future local implementation, mock signing is limited to local/test and forbidden in production. No production license-server code or deployment is in scope.
