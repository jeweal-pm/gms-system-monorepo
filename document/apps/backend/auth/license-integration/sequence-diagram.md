# Sequence diagram: auth/gateway license integration

- Source UI revision / SA revision: none / `auth-license` revision 2
- Status: approved; SA revision 2 approved 2026-10-11
- Main user flow: [license flow](../../../../diagram/license-flow.md)
- Related API operations: BE-LIC-001 to BE-LIC-007

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend same-origin proxy
    participant GW as backend-api-gateway
    participant Auth as backend-api-auth
    participant DB as PostgreSQL auth schema
    participant LS as License Server
    participant CRM as CRM provisioning client

    U->>FE: Request protected app data
    FE->>GW: tRPC request + session cookie
    GW->>Auth: GET /internal/v1/session-context + cookie
    Auth->>Auth: Better Auth validates session
    Auth->>DB: Read LicenseCache by userId
    alt no cached token or refresh due
        Auth->>LS: lookup/refresh(email), instance headers, bounded timeout
        alt remote response valid and token verifies
            LS-->>Auth: signed token
            Auth->>DB: Upsert token + fetchedAt
        else remote unavailable and cached token within approved grace
            Auth->>Auth: verify signature/claims, evaluate GRACE
        else invalid token, inactive license, or grace expired
            Auth-->>GW: sanitized denied/unverifiable status
        end
    else token is fresh
        Auth->>Auth: verify signature and evaluate claims locally
    end
    Auth-->>GW: session + trusted license status (never token)
    alt allowed license status
        GW->>GW: licensedProcedure permits request
        GW-->>FE: procedure result
    else restricted status
        GW-->>FE: mapped LICENSE_REQUIRED/EXPIRED/REVOKED/UNVERIFIABLE
    end

    U->>FE: Submit activation key
    FE->>GW: license.activate(key) + session cookie
    GW->>Auth: POST /internal/v1/license/activate + cookie/key
    Auth->>Auth: validate session; take email from session; validate key
    Auth->>LS: activate(email,key) over HTTPS
    alt activated / already activated token returned
        LS-->>Auth: signed token
        Auth->>Auth: verify signature and binding
        Auth->>DB: Upsert cache; never persist key
        Auth-->>GW: sanitized status
        GW-->>FE: success status
    else invalid key / throttled / unavailable
        LS-->>Auth: documented error or timeout
        Auth-->>GW: stable domain error; redact key
        GW-->>FE: error code
    end

    CRM->>Auth: POST /api/v1/users(email,name,role) + CRM credential
    Auth->>LS: lookup(email, instance credential)
    alt pending issued key
        LS-->>Auth: state=pending
        Auth->>DB: Create user; no license token row yet
        Auth->>Mail: Send generated password after account commit
        Auth-->>CRM: 201 Created
    else active usable signed license
        LS-->>Auth: state=active + token
        Auth->>Auth: Verify signature, issuer/audience, instance, subject, status, expiry
        Auth->>DB: Create user + cache verified token
        Auth->>Mail: Send generated password after commit
        Auth-->>CRM: 201 Created
    else none / inactive / invalid token / outage
        LS-->>Auth: none, ineligible token or unavailable
        Auth-->>CRM: LICENSE_REQUIRED or LICENSE_UNVERIFIABLE; no user or password email
    end

    U->>FE: Request email change for licensed account
    FE->>Auth: Better Auth change-email request + session
    Auth->>Auth: Reject; licensed account email is immutable
    Auth-->>FE: EMAIL_CHANGE_NOT_ALLOWED; account and license remain unchanged
    Note over U,LS: To use another email, create a new account and obtain a separately issued license.

    U->>Auth: Sign in successfully
    Auth->>DB: Serialize per-user session cleanup; keep newest only
    Auth-->>U: Return cookie for sole active session
```

No frontend page/redirect design is included here. License transfer/rebind is unsupported.
JWT issuer, audience and error envelope are approved; remote timeout and 7-day grace are bounded as in
[error handling](error-handling.md).
