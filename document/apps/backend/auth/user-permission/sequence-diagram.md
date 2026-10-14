# Sequence diagram: auth + gateway / user-permission

- Source UI revision / SA revision: 1 / 1 (pending-review)
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
    B->>G: userAdmin.create {email, password, name, phone, locationKeys, active, permissions, photo?}
    G->>G: superAdminProcedure + zod (body ≤ 1 MiB)
    G->>A: POST /internal/v1/user-admin/users (cookie, 6 s)
    A->>A: requireSuperAdmin · validate · catalog/location/photo magic-byte checks
    A->>DB: find user by normalized email
    alt exists
        A-->>G: 409 EMAIL_ALREADY_EXISTS
        G-->>B: CONFLICT (field error on Username)
    end
    A->>L: lookup(email) (≤ 3 s total, 1 retry on transient)
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
            A->>DB: INSERT User(role='user', active, phone) + Account(credential) + UserPermission[] + UserLocation[] + UserPhoto?
            A->>DB: COMMIT (P2002 → 409 EMAIL_ALREADY_EXISTS)
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
    B->>G: userAdmin.update {id, expectedUpdatedAt, ...changed}
    G->>A: PATCH /internal/v1/user-admin/users/:id (cookie, 5 s)
    A->>A: requireSuperAdmin · strict schema (no email)
    opt password present
        A->>A: Argon2id hash (outside transaction)
    end
    A->>DB: BEGIN
    A->>DB: SELECT role, updatedAt FROM User WHERE id FOR UPDATE
    alt not found
        A-->>G: 404 USER_NOT_FOUND
    else role='admin'
        A-->>G: 403 SUPER_ADMIN_READ_ONLY
    else updatedAt != expected
        A-->>G: 409 USER_CHANGED
    else ok
        A->>DB: UPDATE User (name, phone, active, updatedAt=now)
        opt permissions given
            A->>DB: DELETE + INSERT UserPermission set
        end
        opt locationKeys given
            A->>DB: DELETE + INSERT UserLocation set
        end
        opt photo given (null removes)
            A->>DB: UPSERT / DELETE UserPhoto
        end
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
        A-->>G: 403 SUPER_ADMIN_READ_ONLY
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
    B->>G: dashboard.shortcutGroups (or future vendor.list etc.)
    G->>A: session-context (as in 1)
    A-->>G: {license, authz}
    G->>G: licensedProcedure, then permittedProcedure(menuKey, action)
    alt Super Admin or grant present
        G-->>B: data (PRICE fields only with menuKey:PRICE)
    else missing grant
        G-->>B: FORBIDDEN PERMISSION_DENIED (shortcuts: item filtered out)
    end
```

## 6. Inactive user signs in

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Next proxy /api/auth
    participant A as Auth (Better Auth)
    participant DB as PostgreSQL auth
    B->>P: POST /api/auth/sign-in/email
    P->>A: forward
    A->>DB: lockout check, verify password (existing)
    alt wrong password
        A-->>B: 401 / 423 (existing ADR-0012 behavior)
    else correct and active=false
        A->>DB: DELETE new Session
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
