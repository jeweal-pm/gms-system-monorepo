# Service architecture: partner + gateway / customer

- Feature ID / SA revision: `customer` / 1
- Source UI revision / TODO: 1 (UI spec and central TODO [customer.md](../../../../task/todo/customer.md) being written by ui-spec in parallel; backend rows `BE-CUS-*` are integrated by the parent)
- Status: **pending-review**
- approved-revision: none · approved-by: none · approved-at: none · approval-evidence: none
- Binding ADR: [ADR-0018](../../../../adr/0018-customer-master-partner-service.md) revision 1, **Accepted** 2026-10-14 ("อนุมัติ ADR-0018"). This bundle details ADR-0018; it does not reopen its decisions.
- Reused unchanged: [ADR-0001](../../../../adr/0001-record-architecture-decisions.md) (domain modules own their schema), [ADR-0007](../../../../adr/0007-trpc-procedure.md) (tRPC), [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md) (`permittedProcedure`), the gateway session-context and error formatter of [user-permission](../../auth/user-permission/api-contract.md#implementation-notes-first-slice-backend-2026-10-12)
- Main flow: [customer-flow.md](../../../../diagram/customer-flow.md)
- Review bundle: this file, [decisions](decisions.md), [API contract](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), ADR-0018, central TODO rows `BE-CUS-001…015`, infra bundle `document/infra/services/backend-api-partner/1/security.md` (**pending**, infra researching in parallel)

## Domain and service boundaries

Verified against the checkout on 2026-10-14 (branch `feat/14-10-26-customer`):

- `backend-api-gateway` (NestJS 12.1.2 HTTP, `@trpc/server` 11.19.0, port 4000). `src/main.ts`
  builds each tRPC context from auth `GET /internal/v1/session-context` (3.5 s), which already
  returns `authz {isSuperAdmin, permissions[]}`. `src/trpc/router.ts` exports
  `permittedProcedure(menuKey, action)` (Super Admin passes, otherwise exact grant, else
  `FORBIDDEN`/`PERMISSION_DENIED`). `src/trpc/auth-client.ts` `callAuth` is auth-specific
  (cookie forwarding, `USER_*` fallback codes) and is **not** reused for partner.
- `backend-api-auth` (NestJS, Prisma 7.10.0 + `@prisma/adapter-pg`, schema `auth`). The
  permission catalog (`src/permission/catalog.ts`) already contains leaf `customer` under
  `partner-master` with all six actions. **No auth change is needed.**
- Browser traffic goes only through the Next same-origin proxy `frontend/src/app/api/trpc/[...path]/route.ts` → gateway `/trpc`.
- No customer table, service or schema exists yet.

| Concern | Owner | Interface |
|---|---|---|
| Customer + address persistence, validation, business rules | **new** `backend-api-partner` (`@gem-crm/backend-api-partner`, port 3201) | internal REST `/internal/v1/customers…` (service token + actor header) |
| Data | PostgreSQL schema `partner` in DB `f1_system`, own Prisma project and own `partner._prisma_migrations` | Prisma client generated in `backend-api-partner/src/generated/prisma` |
| Currency / country options | partner `src/customer/reference-data.ts` (code constants + `Intl`) | `GET /internal/v1/customers/options` |
| Browser contract, permission enforcement | gateway `src/trpc/**` | tRPC `customer.list/get/create/update/delete/options` via `permittedProcedure("customer", …)` |
| Session, license, grants | auth (unchanged) | existing session-context |

Partner never calls auth and never reads `auth` tables; auth never reads `partner`. Gateway
never touches the database. `createdBy`/`updatedBy` store the gateway-supplied actor user ID
with no cross-schema FK.

### Partner module layout (proposal for backend)

```
backend-api-partner/
  package.json, tsconfig.json, tsconfig.build.json, nest-cli.json, Dockerfile   (integration-owned, parent serializes)
  prisma.config.ts, prisma/schema.prisma, prisma/migrations/<ts>_customer/  (backend writes, parent serializes like auth prisma/**)
  src/main.ts, src/app.module.ts                                             (integration-owned)
  src/database/prisma-client.ts, prisma-lifecycle.service.ts
  src/internal-auth/service-token.guard.ts                                   (token + actor header)
  src/health/health.controller.ts                                            (GET /health/live, /health/ready)
  src/customer/customer.controller.ts, customer.service.ts, customer.schemas.ts,
             customer.errors.ts, reference-data.ts, cursor.ts
```

Gateway additions: `src/trpc/partner-client.ts` (`callPartner`), `src/trpc/customer-schemas.ts`,
and a `customer` sub-router in `src/trpc/router.ts`.

## Behavior and operation

1. **Authentication between services.** Gateway sends `Authorization: Bearer <PARTNER_SERVICE_TOKEN>`
   and `X-Actor-User-Id: <ctx.session.user.id>` on every call. Partner's global guard compares
   SHA-256 digests of the presented and configured token with `crypto.timingSafeEqual`; missing
   or wrong → `401 UNAUTHORIZED` envelope. `X-Actor-User-Id` must match `^[A-Za-z0-9_-]{1,64}$`
   on mutations (else `400 VALIDATION_ERROR`). Partner refuses to start when
   `PARTNER_SERVICE_TOKEN` is shorter than 32 characters (all environments; the dev Compose
   default is ≥ 32), and gateway refuses to start in `NODE_ENV=production` without it.
   `/health/*` are the only unauthenticated routes and return no data.
2. **Authorization** is enforced by gateway only (`permittedProcedure`), per ADR-0018 alternative
   "Partner verifies session itself" rejected. Partner trusts the token-authenticated gateway.
   See [authorization.md](authorization.md).
3. **Validation** happens twice with the same rules: gateway zod (fast fail, `VALIDATION_ERROR`
   with field paths) and partner zod (authoritative, also code/country/currency membership and
   default-address rules). Shapes are in [api-contract.md](api-contract.md).
4. **Create:** one Prisma interactive transaction (`timeout 4000 ms`, `maxWait 2000 ms`) inserts
   `Customer` and all `CustomerAddress` rows. Unique violation on `code_key` (`P2002`) →
   `409 CUSTOMER_CODE_TAKEN` with field error `code`. No pre-check query is needed; the unique
   index is the source of truth. Create is **not idempotent**.
5. **Update (whole replacement, optimistic):** input carries `expectedUpdatedAt`. In one transaction:
   `UPDATE "partner"."customer" SET …, updated_at = GREATEST(now(), $expected + 1 ms), updated_by = $actor
   WHERE id = $id AND updated_at = $expected`. 0 rows → re-select by id: missing → `404 CUSTOMER_NOT_FOUND`,
   present → `409 CUSTOMER_STALE`. Then `DELETE` all addresses of the customer and `INSERT` the new set
   (positions renumbered 1..n per type). The `GREATEST` guard guarantees the version always moves
   forward even for two writes in the same millisecond. Code conflict → `CUSTOMER_CODE_TAKEN`.
6. **Delete (hard, always allowed):** `DELETE FROM customer WHERE id = $id`; addresses cascade
   (FK `ON DELETE CASCADE`). 0 rows → `404 CUSTOMER_NOT_FOUND`. No optimistic check and no
   "in use" check (ADR-0018: future Quotation/Sale copy the customer name into their own tables).
7. **Default address rule** (per type): if the input has no `isDefault: true`, partner sets the
   first entry as default; more than one → `VALIDATION_ERROR` (`code: "multiple_defaults"` on
   `invoiceAddresses` / `shippingAddresses`). The partial unique index is a backstop.
8. **List:** search `q` (trimmed, ≤ 100) is a case-insensitive *contains* match on `name` OR
   `code` (`ILIKE` with `%`, `_`, `\` escaped); optional `active` filter; order
   `name_key ASC, id ASC`; keyset cursor on `(name_key, id)`; `limit` 1–50 (default 50);
   `total` is `COUNT(*)` with the same filter (ignores cursor). Two queries in one read
   transaction (`REPEATABLE READ`, read-only) so `total` and the page agree.
9. **Options:** currency list built once at partner start from
   `Intl.supportedValuesOf("currency")` with English `Intl.DisplayNames` (`type: "currency"`),
   sorted by code; country list is the ISO 3166-1 alpha-2 constant (249 codes) with
   `Intl.DisplayNames` (`type: "region"`) names. Values not resolvable by `DisplayNames` fall back
   to the code as label. On update, the customer's **currently stored** `currencyCode` /
   `countryCode` values are accepted even if a later Node/ICU upgrade drops them from the list,
   so old records stay editable.
10. **Timeouts and retries:** gateway → partner `AbortSignal.timeout` 3 000 ms for `list/get/options`,
    5 000 ms for `create/update/delete`; **no retry of anything** in gateway (reads are retried by
    the browser query client). Partner transaction timeout 4 000 ms < gateway write timeout.
    pg pool `connectionTimeoutMillis` 2 000 ms. A gateway timeout on a mutation may still have
    committed: UI refreshes the list/record before letting the user retry (see [errors](error-handling.md)).
11. **Logging:** pino-http on partner redacts `req.headers.authorization` (the service token);
    `X-Actor-User-Id` is an opaque ID and may be logged. Request bodies are never logged. Structured events `customer.created|updated|deleted` carry actor ID, customer ID,
    address counts and changed field **names**; never name, code, email, phone, tax ID or address text.
12. **Body limit:** partner mounts `express.json({ limit: "256kb" })` (Nest `bodyParser: false`,
    as auth does). Valid gateway inputs are bounded by zod to ≈ 40 KB (20 addresses × ~1.3 KB +
    header), so the gateway re-serialized body is always far below 256 KB. Gateway additionally
    sets tRPC `maxBodySize: 1_048_576` on `createExpressMiddleware` (currently unset = unbounded;
    the 1 MiB value matches the user-permission plan; verify the option name on 11.19.0).

## Capacity and rollout

| Container | CPU limit | Memory limit |
|---|---|---|
| postgres | 1.25 | 2 GiB |
| backend-api-auth | 0.5 | 1 GiB |
| backend-api-gateway | 0.5 | 768 MiB |
| frontend | 0.6 | 1 280 MiB |
| **backend-api-partner (new)** | **0.35** | **512 MiB** |
| **Total** | **3.2 of 4 vCPU** | **5.5 GiB of 8 GB** |

Headroom ≈ 0.8 vCPU / 2.5 GB for OS, Docker and page cache, as in ADR-0018.

- **PostgreSQL connections:** auth pg pool (default max 10) + partner **max 5** + transient
  migration connections (≤ 2 at start) ≈ 17 of the default `max_connections` 100.
- **Partner pool:** `max: 5`, `idleTimeoutMillis: 30 000`, `connectionTimeoutMillis: 2 000`.
  Node heap: set `NODE_OPTIONS=--max-old-space-size=320` so V8 stays well under 512 MiB (infra to confirm).
- **Data size:** expected low thousands of customers; ≤ 20 addresses each. Row ≈ 0.5 KB,
  address ≈ 0.4 KB → ~10 MB per 10 000 customers. List page ≤ 50 × ~150 B; `get` ≤ ~30 KB.
- **Search cost:** contains-`ILIKE` cannot use the btree indexes and scans `customer`
  (fine below ~50 000 rows; < 10 ms expected). A trigram index (`pg_trgm` extension) is
  deliberately not proposed; revisit with a measurement.
- **No cache, worker, queue, replica or volume.** Options are computed once in memory (~30 KB).
- **Measurements still needed:** partner idle/peak RSS in the production image; list p95 with
  10 000 seeded rows; create/update latency.

**Rollout order:** (1) infra bundle approved → (2) partner scaffold + migration (BE-CUS-001…006)
→ (3) gateway client + router (BE-CUS-007…009) → (4) parent-serialized Compose/env/Dockerfile/workspace
edits (BE-CUS-011) → (5) frontend wiring → (6) devops CI/image matrix. The gateway's `customer.*`
procedures return `PARTNER_UNAVAILABLE` while partner is not deployed, so steps 3 and 4 may ship
in either order without breaking existing features.

**Rollback:** remove the frontend route/tab, then the gateway `customer` router (optional; it only
fails closed) and the partner service from Compose. Schema `partner` stays and does not affect
auth. Full removal is a deliberate forward step (`DROP SCHEMA partner CASCADE`, data loss) — see
[database-diagram.md](database-diagram.md#migration-backfill-compatibility-rollback).

## Container infrastructure

**Triggered** (new container `backend-api-partner`, new image, new secret, new DB principal).
Infra bundle `document/infra/services/backend-api-partner/1/security.md` is **pending** and must be
included in this review before any Compose/Dockerfile edit. SA requires from it:

1. **Network:** partner reachable **only** from gateway (internal network); no host `ports:` in base
   Compose; whether dev override publishes `127.0.0.1:3201` for debugging. Partner needs egress
   **only** to `postgres:5432`; no internet egress at runtime.
2. **Secret delivery:** how `PARTNER_SERVICE_TOKEN` reaches gateway and partner in production
   (env vs Compose secret file `/run/secrets/…`; if file-based, the backend adapter must read
   `PARTNER_SERVICE_TOKEN_FILE` — tell SA/backend which), rotation procedure (both containers
   restarted together; no dual-token window is designed in revision 1).
3. **DB role:** keep the shared `f1_user` (as auth does today) or create a dedicated role
   (e.g. `partner_app`) that owns schema `partner` with no privileges on `auth`. If dedicated,
   specify the bootstrap mechanism (who runs `CREATE ROLE`/`CREATE SCHEMA partner AUTHORIZATION …`
   before the first `migrate deploy`) and the resulting `PARTNER_DATABASE_URL`.
4. **Runtime hardening:** non-root UID, read-only root filesystem (Prisma 7 client needs no engine
   download at runtime; writable paths needed: none expected, confirm `/tmp`), `cap_drop: ALL`,
   `no-new-privileges`, PID limit, `restart` policy.
5. **Startup ordering:** both auth and partner run `prisma migrate deploy` at start, and Prisma
   Migrate takes the **same** PostgreSQL advisory lock for every project on the database
   (10 s wait limit). Concurrent first starts can fail one migration with a lock timeout; infra
   decides between `restart: on-failure`, `depends_on: backend-api-auth: service_healthy`, or a
   separate one-shot migrate job.
6. **Healthcheck:** whether to use `GET /health/ready` (partner provides it; DB `SELECT 1`) with a
   Node-based probe (the slim image has no curl), and gateway `depends_on` condition.
7. **Image:** base `node:24.11.0-bookworm-slim` as the other services, build stage vs runtime
   stage, and confirmation that other Dockerfiles must copy `backend-api-partner/package.json`
   for `pnpm install --frozen-lockfile` (see [dependencies.md](dependencies.md#shared-file-changes-proposed-parent-serialized)).
