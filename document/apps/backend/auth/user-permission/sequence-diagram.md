# Sequence diagram: auth + gateway / user-permission

- Source UI revision / SA revision: 2 / 2 (**implemented**; [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 Accepted 2026-10-15, owner "frontend backend อนุมัติ ADR-0020"). Revision 1 content below is kept where unchanged; revision 2 notes override it.
- Main user flow: [user-permission-flow.md](../../../../diagram/user-permission-flow.md)
- Related API operations / TODO IDs: [API contract](api-contract.md); BE-UP-001…014; FE-UP-007, 009, 012, 013, 014
- Participants: Browser (Next.js page) → Next proxy (`/api/trpc`, `/api/v1`) → Gateway (NestJS + tRPC) → Auth (NestJS, Better Auth) → PostgreSQL schema `auth`; License server (remote) or MockLicenseClient (dev)

## 1. Page load, context and guard

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Next proxy /api/trpc
    participant G as Gateway tRPC
    participant A as Auth
    participant DB as PostgreSQL auth
    B->>P: batch permission.mine, userAdmin.list, permission.catalog, userAdmin.locationOptions
    P->>G: forward with cookie
    G->>A: GET /internal/v1/session-context (cookie, 3.5 s)
    A->>DB: Better Auth getSession (user incl. role, active)
    alt no session or active=false
        A-->>G: 401
        G-->>B: UNAUTHORIZED, existing redirect to /login
    else session ok
        A->>A: license resolveStatus (existing, 15 s cache)
        A->>DB: SELECT menu_key, action FROM UserPermission WHERE user_id=$1
        A-->>G: {session, license, authz:{isSuperAdmin, permissions}}
        G->>G: licensedProcedure (license state)
        alt license restricted
            G-->>B: LICENSE_* (existing handling)
        else not Super Admin
            G-->>B: permission.mine ok · userAdmin.* FORBIDDEN SUPER_ADMIN_REQUIRED
            Note over B: FE-UP-014 access-denied state
        else Super Admin
            G->>A: GET /internal/v1/user-admin/users (cookie)
            A->>A: requireSuperAdmin(session)
            A->>DB: SELECT users (cap 600) + COUNT role='user'
            A-->>G: {items, usage:{used, limit}}
            G-->>B: list, catalog, options, mine
        end
    end
```

## 2. Create user

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant A as Auth
    participant L as License server / mock
    participant DB as PostgreSQL auth
    B->>G: userAdmin.create {username, password, name, phone, locationKeys, active, permissions}
    G->>G: superAdminProcedure + zod (body ≤ 1 MiB)
    G->>A: POST /internal/v1/user-admin/users (cookie, 6 s)
    A->>A: requireSuperAdmin · validate · catalog/location/photo magic-byte checks
    A->>DB: find user by normalized username
    alt exists
        A-->>G: 409 USERNAME_TAKEN
        G-->>B: CONFLICT (field error on Username)
    end
    A->>L: lookup(username sent in the existing `email` field) (≤ 3 s total, 1 retry on transient)
    alt none / inactive / expired
        A-->>G: 422 USER_LICENSE_NOT_ELIGIBLE
    else outage / malformed
        A-->>G: 503 USER_LICENSE_UNVERIFIABLE
    else pending or verified active
        A->>A: Argon2id hash
        A->>DB: BEGIN · pg_advisory_xact_lock(hashtext('auth.user-seat'))
        A->>DB: SELECT count(*) FROM User WHERE role='user'
        alt used >= USER_SEAT_LIMIT
            A->>DB: ROLLBACK
            A-->>G: 409 USER_LIMIT_REACHED
        else under limit
            A->>DB: INSERT User(role='user', username, email='<id>@users.invalid', active, phone) + Account(credential) + UserPermission[] + UserLocation[]
            A->>DB: COMMIT (P2002 → 409 USERNAME_TAKEN)
            A->>DB: upsert LicenseCache(token) if active token
            alt cache write fails
                A->>DB: DELETE User (compensation, same as CRM)
                A-->>G: 503 USER_LICENSE_UNVERIFIABLE
            else ok
                A-->>G: 201 {id, updatedAt}  (no password)
                G-->>B: {id, updatedAt} · client invalidates list
            end
        end
    end
```

## 3. Update (permissions, profile, password reset, deactivate)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant A as Auth
    participant DB as PostgreSQL auth
    B->>G: userAdmin.update {id, expectedUpdatedAt?, username? (echo only), ...changed}
    G->>A: PATCH /internal/v1/user-admin/users/:id (cookie, 5 s)
    A->>A: requireSuperAdmin · strict schema · validate permission/location sets
    A->>DB: SELECT role (pre-check)
    alt Super Admin target and (permissions or password or active=false)
        A-->>G: 403 SUPER_ADMIN_LOCKED (no Argon2 cost)
    end
    opt password present
        A->>A: Argon2id hash (outside transaction)
    end
    A->>DB: BEGIN
    A->>DB: SELECT role, username, updatedAt FROM User WHERE id FOR UPDATE
    alt not found
        A-->>G: 404 USER_NOT_FOUND
    else username sent and differs
        A-->>G: 400 USERNAME_IMMUTABLE
    else expectedUpdatedAt sent and differs
        A-->>G: 409 USER_CHANGED
    else role='admin' and (permissions or password or active=false)
        A-->>G: 403 SUPER_ADMIN_LOCKED
    else ok (Super Admin: name, phone, locationKeys only)
        A->>DB: UPDATE User (name, phone, active, updatedAt=now)
        opt permissions given
            A->>DB: DELETE + INSERT UserPermission set
        end
        opt locationKeys given
            A->>DB: DELETE + INSERT UserLocation set
        end
        Note over A: photo still deferred (strict schema rejects it)
        opt password given
            A->>DB: UPDATE Account.password · reset LoginLockout + failed_login_count
        end
        opt password given or active=false
            A->>DB: DELETE Session WHERE userId
        end
        A->>DB: COMMIT
        A-->>G: 200 {id, updatedAt}
        G-->>B: ok · invalidate list + get(id)
    end
```

## 4. Delete

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant A as Auth
    participant DB as PostgreSQL auth
    B->>G: userAdmin.delete {id}  (dialog shows "Deleting...")
    G->>A: DELETE /internal/v1/user-admin/users/:id (cookie, 5 s)
    A->>DB: BEGIN · SELECT role FROM User WHERE id FOR UPDATE
    alt missing
        A-->>G: 404 USER_NOT_FOUND
    else admin or self
        A-->>G: 403 SUPER_ADMIN_LOCKED
    else regular user
        A->>DB: DELETE User (cascade Session, Account, LicenseCache, LicenseActivationLockout, UserPermission, UserLocation, UserPhoto · LoginAttempt.user_id → NULL)
        A->>DB: COMMIT
        A->>A: evict license status cache entry
        Note over A: license server NOT called (QL1 external)
        A-->>G: 200 {ok:true}
        G-->>B: dialog closes · invalidate list
    end
```

## 5. Enforcement on a menu procedure (current and future features)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant A as Auth
    B->>G: dashboard.shortcutGroups (or customer.*, vendor.*)
    G->>A: session-context (as in 1)
    A-->>G: {license, authz}
    G->>G: licensedProcedure, then permittedProcedure(menuKey, action)
    alt Super Admin or grant present
        G-->>B: data (PRICE fields only with menuKey:PRICE)
    else missing grant
        G-->>B: FORBIDDEN PERMISSION_DENIED (shortcuts: no dashboard:VIEW → []; item without slug:VIEW filtered out)
    end
```

## 6. Sign-in with username (ADR-0020) and inactive users

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Next proxy /api/auth
    participant A as Auth (Better Auth)
    participant DB as PostgreSQL auth
    B->>P: POST /api/auth/sign-in/username {username, password, rememberMe?}
    P->>A: forward (rate limit 5/min/IP on this path; /sign-in/email → 404)
    A->>A: normalize username (trim + lowercase)
    A->>DB: lockout check by HMAC(username) (ADR-0012)
    alt locked
        A-->>B: 423 {code:"ACCOUNT_LOCKED", retryAfterSeconds}
    end
    A->>DB: find user by username, verify Argon2id password
    alt wrong password, unknown or impossible username (Better Auth 401/422)
        A->>DB: increment LoginLockout bucket
        A-->>B: 401 {code:"INVALID_USERNAME_OR_PASSWORD", attemptsRemaining} or 423 on the 3rd failure
    else correct and active=false
        A->>DB: DELETE new Session (cookie expired)
        A-->>B: 403 {code:"ACCOUNT_INACTIVE"}
    else correct and active
        A-->>B: existing success (single-session cleanup)
    end
```

## 7. Photo download and CSV export

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Next proxy /api/v1
    participant G as Gateway REST
    participant A as Auth
    participant DB as PostgreSQL auth
    B->>P: GET /api/v1/user-admin/users/:id/photo?v=hash (img src) / GET /api/v1/user-admin/export.csv
    P->>G: forward with cookie
    G->>A: GET /internal/v1/user-admin/... (cookie, 3.5 s)
    A->>A: validate session, license usable, Super Admin
    A->>DB: SELECT UserPhoto / SELECT users + grants + locations (cap 600)
    A-->>G: bytes (Content-Type, ETag) / CSV (BOM, formula-escaped)
    G-->>B: stream with nosniff + Content-Disposition (inline / attachment)
```

The REST routes do not pass through tRPC middleware, so gateway first resolves the same
session context and applies the same license + Super Admin checks before forwarding.
