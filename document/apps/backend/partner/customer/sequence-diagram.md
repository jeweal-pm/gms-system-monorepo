# Sequence diagram: partner + gateway / customer

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Main user flow: [customer-flow.md](../../../../diagram/customer-flow.md)
- Related API operations / TODO IDs: [API contract](api-contract.md); BE-CUS-001…015; consuming `FE-CUS-*` ([central TODO](../../../../task/todo/customer.md))
- Participants: Browser (Next.js `/setup/customer`) → Next proxy `/api/trpc` → Gateway (NestJS + tRPC) → Auth (session-context only, unchanged) → Partner (NestJS) → PostgreSQL schema `partner`

## 1. Page load: context, permission, list and options

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Next proxy /api/trpc
    participant G as Gateway tRPC
    participant A as Auth
    participant S as Partner
    participant DB as PostgreSQL partner
    B->>P: batch permission.mine, customer.list{limit:50}, customer.options
    P->>G: forward (cookie)
    G->>A: GET /internal/v1/session-context (cookie, 3.5 s)
    alt no session
        A-->>G: 401
        G-->>B: UNAUTHORIZED (existing redirect to /login)
    else session ok
        A-->>G: {session, license, authz}
        G->>G: licensedProcedure, then permittedProcedure("customer","VIEW")
        alt license restricted
            G-->>B: LICENSE_* (existing handling)
        else no customer:VIEW and not Super Admin
            G-->>B: permission.mine ok · customer.* FORBIDDEN PERMISSION_DENIED
            Note over B: access-denied state
        else allowed
            par list
                G->>S: GET /internal/v1/customers?limit=50 (Bearer token, X-Actor-User-Id, 3 s)
                S->>S: token guard · zod query
                S->>DB: BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ
                S->>DB: SELECT id,name,code,active,updated_at ORDER BY name_key,id LIMIT 51
                S->>DB: SELECT count(*) (same filter)
                S->>DB: COMMIT
                S-->>G: 200 {items, nextCursor, total}
            and options
                G->>S: GET /internal/v1/customers/options (3 s)
                S-->>G: 200 {currencies, countries} (in-memory)
            end
            G->>G: output zod validation
            G-->>B: mine, list, options
        end
    end
```

## 2. Search, page and open a customer

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant S as Partner
    participant DB as PostgreSQL partner
    B->>G: customer.list {q:"sample", cursor?}
    G->>S: GET /internal/v1/customers?q=sample&cursor=… (3 s)
    alt cursor cannot be decoded
        S-->>G: 400 VALIDATION_ERROR {path:"cursor"}
        G-->>B: BAD_REQUEST → client restarts without cursor
    else ok
        S->>DB: WHERE (name ILIKE '%sample%' OR code ILIKE '%sample%') AND (name_key,id) > cursor
        S-->>G: 200 page
        G-->>B: page
    end
    B->>G: customer.get {id}
    G->>S: GET /internal/v1/customers/:id (3 s)
    S->>DB: SELECT customer + addresses ORDER BY type, position
    alt missing
        S-->>G: 404 CUSTOMER_NOT_FOUND
        G-->>B: NOT_FOUND → toast, list refetch, back to draft
    else found
        S-->>G: 200 CustomerDetail
        G-->>B: CustomerDetail (form filled, updatedAt kept as version)
    end
```

## 3. Create customer

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant S as Partner
    participant DB as PostgreSQL partner
    B->>B: react-hook-form + Zod (same rules)
    B->>G: customer.create {…, invoiceAddresses[], shippingAddresses[]}
    G->>G: permittedProcedure("customer","ADD") · zod strict + default rule
    alt invalid
        G-->>B: BAD_REQUEST VALIDATION_ERROR fieldErrors (red fields)
    else no grant
        G-->>B: FORBIDDEN PERMISSION_DENIED
    else ok
        G->>S: POST /internal/v1/customers (token, actor, 5 s, no retry)
        S->>S: zod + currency/country membership + defaults (first becomes default if none)
        S->>DB: BEGIN (timeout 4 s)
        S->>DB: INSERT customer (code_key=lower(code), name_key=lower(name), created_by=actor)
        S->>DB: INSERT customer_address × n (type, position 1..n)
        alt unique violation on code_key (P2002)
            S->>DB: ROLLBACK
            S-->>G: 409 CUSTOMER_CODE_TAKEN [{path:"code",code:"duplicate"}]
            G-->>B: CONFLICT → Code Name field error
        else committed
            S->>DB: COMMIT
            S-->>G: 201 {id, updatedAt}
            G-->>B: {id, updatedAt} → invalidate list, open saved record
        end
    end
```

## 4. Update customer (whole replacement, optimistic concurrency)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant S as Partner
    participant DB as PostgreSQL partner
    B->>G: customer.update {id, expectedUpdatedAt, …all fields}
    G->>G: permittedProcedure("customer","EDIT") · zod
    G->>S: PUT /internal/v1/customers/:id (5 s)
    S->>DB: BEGIN
    S->>DB: UPDATE customer SET …, updated_at=GREATEST(now(), expected+1ms), updated_by=actor WHERE id AND updated_at=expected
    alt 0 rows and id missing
        S->>DB: ROLLBACK
        S-->>G: 404 CUSTOMER_NOT_FOUND
        G-->>B: NOT_FOUND → "deleted elsewhere", list refetch
    else 0 rows and id exists
        S->>DB: ROLLBACK
        S-->>G: 409 CUSTOMER_STALE
        G-->>B: CONFLICT → "changed by someone else — reload?" → get(id)
    else 1 row
        S->>DB: DELETE customer_address WHERE customer_id
        S->>DB: INSERT customer_address × n
        alt code_key unique violation
            S->>DB: ROLLBACK
            S-->>G: 409 CUSTOMER_CODE_TAKEN
            G-->>B: CONFLICT → Code Name field error
        else ok
            S->>DB: COMMIT
            S-->>G: 200 {id, updatedAt}
            G-->>B: ok → invalidate list + get(id)
        end
    end
```

## 5. Delete customer (hard)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant S as Partner
    participant DB as PostgreSQL partner
    B->>B: confirm dialog ("Delete customer …?")
    B->>G: customer.delete {id}
    G->>G: permittedProcedure("customer","DELETE")
    alt no grant
        G-->>B: FORBIDDEN PERMISSION_DENIED (button normally hidden)
    else allowed
        G->>S: DELETE /internal/v1/customers/:id (5 s)
        S->>DB: DELETE FROM customer WHERE id (addresses cascade)
        alt 0 rows
            S-->>G: 404 CUSTOMER_NOT_FOUND
            G-->>B: NOT_FOUND → treated as already deleted, list refetch
        else deleted
            S-->>G: 200 {ok:true}
            G-->>B: dialog closes, new draft, list refetch
        end
    end
```

## 6. Partner unavailable, timeout or token mismatch

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant G as Gateway tRPC
    participant S as Partner
    B->>G: any customer.* call (permission already passed)
    G->>S: request (3 s read / 5 s write)
    alt connection refused / DNS / timeout
        G-->>B: SERVICE_UNAVAILABLE PARTNER_UNAVAILABLE (no retry)
        Note over B: reads: query client may retry; mutations: refresh list before re-submitting
    else 401 from partner (token wrong or missing)
        G->>G: log error "partner rejected service token" (no token value)
        G-->>B: SERVICE_UNAVAILABLE PARTNER_UNAVAILABLE (never UNAUTHORIZED)
    else 5xx from partner
        G-->>B: 503 → PARTNER_UNAVAILABLE · 500 → INTERNAL_SERVER_ERROR
    else malformed or oversize (> 1 MiB) response
        G-->>B: SERVICE_UNAVAILABLE PARTNER_UNAVAILABLE
    end
```
