# Handoff: vendor backend → parent / frontend

- Feature ID / UI revision: `vendor` / 2
- SA revision / ADR: SA revision 1 ([bundle](../../apps/backend/partner/vendor/architecture.md)), [ADR-0019](../../adr/0019-vendor-master.md) revision 1
- From role/scope: backend (senior-nestjs-developer), run 2026-10-15, branch `feat/14-10-26-vendor` (nothing committed or pushed)
- To: parent integration owner → frontend (FE-VEN-010, FE-VEN-011, FE-VEN-002 Home shortcut)
- TODO IDs: BE-VEN-001…010 in [vendor.md](../../task/todo/vendor.md#backend-items-be-ven-), all done
- Approval: SA revision 1 + ADR-0019 revision 1, owner 2026-10-15T11:00+07:00 "อนุมัติ ADR-0019 และ SA vendor rev 1" (already recorded in the TODO, ADR and bundle; not re-recorded)
- Contract: [api-contract.md](../../apps/backend/partner/vendor/api-contract.md) including "Implementation notes (backend, 2026-10-15)"; errors in [error-handling.md](../../apps/backend/partner/vendor/error-handling.md); permissions in [authorization.md](../../apps/backend/partner/vendor/authorization.md)
- Dependencies: none new (no manifest, lockfile, Dockerfile, Compose, `.env.example` or `.github/**` change); infra and devops not triggered (D-V10)
- Verification: [testing.md results](../../apps/backend/partner/vendor/testing.md#results--backend-run-2026-10-15-branch-feat14-10-26-vendor)

## Delivered contract (actual, verified at runtime)

tRPC (browser via `/api/trpc`), all `permittedProcedure("vendor", …)`. Super Admin passes every action. `customer:*` grants give **no** access to `vendor.*` (verified).

| Operation | Permission | Input → output | Domain errors (`data.domainCode`) |
|---|---|---|---|
| `vendor.list` query | `vendor:VIEW` | `{q? (trim, ≤100), active?, cursor? (≤200, nullish), direction? (ignored), limit? (1–50, default 50)}` strict → `{items: {id, name, code, active, updatedAt}[] (≤50), nextCursor: string \| null, total}` | `VALIDATION_ERROR` (bad cursor → `[{path:"cursor",code:"invalid"}]`), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `vendor.get` query | `vendor:VIEW` | `{id: uuid}` → `VendorDetail` (below) | `VENDOR_NOT_FOUND`, `VALIDATION_ERROR`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `vendor.options` query | `vendor:VIEW` | none → `{currencies: {code,name}[] (162, by code), countries: {code,name}[] (249, by name)}`; identical to `customer.options` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `vendor.create` mutation | `vendor:ADD` | vendor fields → `{id, updatedAt}` | `VALIDATION_ERROR`, `VENDOR_CODE_TAKEN` (`[{path:"code",code:"duplicate"}]`), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |
| `vendor.update` mutation | `vendor:EDIT` | `{id, expectedUpdatedAt, ...all vendor fields}` (full replacement) → `{id, updatedAt}` | + `VENDOR_NOT_FOUND`, `VENDOR_STALE` |
| `vendor.delete` mutation | `vendor:DELETE` | `{id}` → `{ok: true}` (hard delete, addresses cascade) | `VENDOR_NOT_FOUND` (treat as already deleted), `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` |

Vendor fields (create; update adds `id` + `expectedUpdatedAt`), all strict:

```ts
{ name: string /* trim 1..200 */, code: string | null /* trim ≤120, "" → null, unique case-insensitively among vendors */,
  currencyCode: string /* ^[A-Z]{3}$ and in options */, active: boolean,
  firstName: string /* trim 1..100 */, middleName: string | null /* ≤100 */, lastName: string | null /* ≤100 */,
  phone: { country: string /* ^[A-Z]{2}$ */, e164: string /* ^\+[1-9]\d{6,14}$ */ } | null   // optional
  email: string /* trimmed, lower-cased, email ≤254, not unique */,
  invoiceAddresses: Array<{ name: string /* 1..200 */, taxId: string | null /* ≤32 */, address: string /* 1..500 */,
    countryCode: string /* ^[A-Z]{2}$ and ISO */, state: string /* 1..100 */, city: string /* 1..100 */,
    postcode: string /* 1..20 */, isDefault: boolean }> /* 1..10 */ }
// expectedUpdatedAt: ISO UTC with exactly 3 fractional digits and "Z" (use the `updatedAt` string returned by get/create/update unchanged)
```

`VendorDetail` key order: `id, name, code, active, updatedAt, currencyCode, firstName, middleName, lastName, phone, email,
invoiceAddresses[{id, position (1..10), name, address, countryCode, state, city, postcode, isDefault, taxId}], createdAt`.
There is no `shippingAddresses` key in input or output.

**Default address (D-V03), verified:** zero `isDefault:true` is valid and is stored as zero (nothing is promoted on create
or update, including after the default address is removed); one is stored as sent; more than one →
`VALIDATION_ERROR` `[{path:"invoiceAddresses", code:"multiple_defaults"}]` from the gateway (and the partner).

Field errors: dot-joined 0-based paths (`invoiceAddresses.1.postcode`), codes = zod 4 issue codes (`too_small`, `too_big`,
`invalid_type`, `invalid_format`, `unrecognized_keys`) plus `duplicate`, `unknown`, `multiple_defaults`, `invalid`.
Unknown keys → `(root)` or the nested object path (`invoiceAddresses.0`) with `unrecognized_keys`.
`unknown` on `currencyCode` / `invoiceAddresses.N.countryCode` means "reload options". Gateway and partner return
identical field errors for every validation case tested.

tRPC codes: `BAD_REQUEST` 400, `UNAUTHORIZED` 401 (no session), `FORBIDDEN` 403 (`PERMISSION_DENIED`, `LICENSE_*`),
`NOT_FOUND` 404 (`VENDOR_NOT_FOUND`), `CONFLICT` 409 (`VENDOR_CODE_TAKEN`, `VENDOR_STALE`), `PAYLOAD_TOO_LARGE` 413,
`SERVICE_UNAVAILABLE` 503 (`PARTNER_UNAVAILABLE`; a wrong service token never logs the user out), `INTERNAL_SERVER_ERROR`.
Mutations are never retried by the gateway; create is not idempotent — after a create/update timeout, refetch the list/record
before allowing a resubmit (reused customer decision).

**Dashboard (FE-VEN-002):** `dashboard.shortcutGroups` Partner Master items are now
`[{label:"Vendor", slug:"vendor", href:"/setup/vendor"}, {label:"Customer", slug:"customer", href:"/setup/customer"}]`
(verified on the ad-hoc gateway and on the restarted dev-stack gateway).

## Frontend actions (FE-VEN-010 / 011)

- Replace the fixture adapter (`features/vendor/api.ts`, `hooks.ts`, `contract.ts`) with `trpc.vendor.*`; infer types as
  customer does: `inferRouterClient<AppRouter>["vendor"]` / `inferRouterOutputs<AppRouter>["vendor"]`. Use
  `vendor.options` (not `customer.options`); `staleTime: Infinity` is fine; key the options cache per procedure.
- Map errors per [error-handling.md](../../apps/backend/partner/vendor/error-handling.md): `VENDOR_CODE_TAKEN` → Code Name field;
  `VENDOR_STALE` → stale banner + reload `get(id)`; `VENDOR_NOT_FOUND` on get/update/delete per the scenarios table;
  `PERMISSION_DENIED` → invalidate `permission.mine`; `PARTNER_UNAVAILABLE` → "Vendor service is unavailable…".
- Read `data.domainCode`/`data.fieldErrors`, never `message` (gateway input-validation failures carry raw zod JSON in
  `message` — pre-existing, unchanged).
- During a rollout where the partner image predates this change, `vendor.*` answers `NOT_FOUND` with `domainCode`
  `"NOT_FOUND"` (the old partner's generic envelope), not `VENDOR_NOT_FOUND`; treat unknown codes with the generic error.
- Frontend `tsc --noEmit` against the new `AppRouter` type: 0 errors (run read-only in `f1-system-frontend-1`).

## Changed files (backend)

- Partner (moved): `src/customer/{cursor.ts,reference-data.ts}` → `src/common/` (only the `errors` import path changed)
- Partner (new): `src/common/{partner-schemas.ts,persistence.ts,request.ts}`, `src/vendor/{vendor.controller.ts,vendor.service.ts,vendor.schemas.ts,vendor.errors.ts}`
- Partner (changed): `src/customer/{customer.controller.ts,customer.service.ts,customer.schemas.ts,customer.errors.ts}`, `src/common/errors.ts` (3 vendor messages)
- Partner integration-owned (backend single writer this run): `src/app.module.ts` (register `VendorController`/`VendorService`), `prisma/schema.prisma` (`Vendor`, `VendorAddress`), new `prisma/migrations/20261015031643_vendor/migration.sql`
- Gateway: new `src/trpc/{partner-schemas.ts,vendor-schemas.ts}`; changed `src/trpc/{customer-schemas.ts,partner-client.ts,router.ts}`
- Docs: [api-contract.md](../../apps/backend/partner/vendor/api-contract.md) (implementation notes), [testing.md](../../apps/backend/partner/vendor/testing.md) (results), BE-VEN rows in [vendor.md](../../task/todo/vendor.md), this file

## Database

- Migration `20261015031643_vendor`: 2 tables, 7 indexes (incl. partial unique `vendor_address_one_default_key`), 1 FK (cascade), 8 CHECKs; additive only, no customer object touched; `prisma migrate diff` after deploy is empty.
- Dev DB state after this run: the dev DB had **no `partner` schema** before (the running stack predates partner wiring); partner's own `db:migrate` applied `20261014120000_customer` and then `20261015031643_vendor`. `public._prisma_migrations` stayed at 5 rows; auth `migrate status` "up to date". All test rows were deleted (vendor/customer tables 0 rows); temporary grant changes were restored.

## Environment gap (parent, not backend scope)

The running dev stack (created 2026-10-12) has **no `backend-api-partner` container**, and `.env` has no `PARTNER_SERVICE_TOKEN`,
so `docker compose -f docker-compose.yml -f docker-compose.dev.yml …` cannot even render (`PARTNER_SERVICE_TOKEN must be set`).
The stack gateway was restarted to load the new code: `dashboard.shortcutGroups` shows the Vendor `href`, but `vendor.*` and
`customer.*` return 503 `PARTNER_UNAVAILABLE` there (fail closed, as before this run). For live FE-VEN-010/011 browser checks,
the parent/owner must add `PARTNER_SERVICE_TOKEN` (≥ 32 chars) to `.env` and bring up the full dev stack (creates the partner
container and the internal `partner-api`/`partner-db` networks, recreates the gateway with `PARTNER_SERVICE_URL`). The
dev stack's partner start-up runs `db:migrate`; both migrations are already applied, so it reports "No pending migrations".
Backend verified everything with ad-hoc containers on `f1-system_default` (customer-run method), all removed afterwards.

## Status

- Capacity: no new container/process/cache/retry; pool `max 5` shared; list ≤ 50; addresses ≤ 10; write tx 4 s, list tx 2.5 s; gateway 3 s / 5 s. Hardened partner image idle RSS 72.5 MiB / 512 MiB.
- Not run: BT-VEN-12 restricted-license case, BT-VEN-20 (scratch-database rollback check, not selected), BT-VEN-21 10 000-row p95 (not selected), timeout timings in BT-VEN-14 (unchanged code path, measured in the customer run), root `pnpm -r` (frontend scope; frontend `tsc` was run).
- Corrective work: none opened; 0 passes used (every check passed on its first run after implementation).
- Not written (outside this run's allowed paths): `document/task/done/` completion report, `document/changelog/` entry, `document/task/index.md`, `tech-stack.md` (no package change) — parent may add them.
- Resume: parent → frontend FE-VEN-010/011 (and the Home shortcut part of FE-VEN-002) against this contract; live browser checks after the environment gap above is closed.
