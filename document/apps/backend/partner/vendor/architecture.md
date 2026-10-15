# Service architecture: partner + gateway / vendor

- Feature ID / SA revision: `vendor` / 1
- Source UI revision / TODO: 2 (approved 2026-10-15) / [central TODO vendor.md](../../../../task/todo/vendor.md), backend rows `BE-VEN-001…010`
- Status: **approved** 2026-10-15
- approved-revision: SA revision 1 + ADR-0019 revision 1 · approved-by: project owner · approved-at: 2026-10-15T11:00+07:00 · approval-evidence: owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1"
- Decision record: [ADR-0019](../../../../adr/0019-vendor-master.md) revision 1, **Proposed** (approved together with this bundle)
- Reused unchanged: [ADR-0018](../../../../adr/0018-customer-master-partner-service.md) (service `backend-api-partner`, schema `partner`, service token, timeouts, hard delete, standard lists), [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md) (`permittedProcedure`), approved [customer SA revision 1](../customer/architecture.md) patterns, infra bundle [backend-api-partner/1](../../../../infra/services/backend-api-partner/1/security.md) (no change)
- Main flow: [vendor-flow.md](../../../../diagram/vendor-flow.md)
- Review bundle: this file, [decisions](decisions.md), [API contract](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), ADR-0019, central TODO rows `BE-VEN-001…010`. **No infra bundle and no devops change** (see the end of this file).

## Domain and service boundaries

Verified against the checkout on 2026-10-15 (branch `feat/14-10-26-vendor`):

- `backend-api-partner` implements Customer only: `src/customer/{customer.controller.ts, customer.service.ts, customer.schemas.ts, customer.errors.ts, cursor.ts, reference-data.ts}`, `src/common/{errors.ts, exception.filter.ts}`, global `ServiceTokenGuard`, `requireActor`, `prisma` client with pool `max 5`, `express.json({limit:"256kb"})`. Migration `20261014120000_customer` is applied in `partner._prisma_migrations`.
- `backend-api-gateway/src/trpc/`: `partner-client.ts` (`callPartner`, 3 s / 5 s, 1 MiB response cap, 404 fallback hard-coded to `CUSTOMER_NOT_FOUND`), `customer-schemas.ts`, `router.ts` (`customer.*`, `shortcutGroups` where Vendor has no `href`). `main.ts` sets tRPC `maxBodySize` 1 MiB.
- `backend-api-auth/src/permission/catalog.ts` has leaf `vendor` under `partner-master`. **No auth change.**
- No vendor table, route or procedure exists.

| Concern | Owner | Interface |
|---|---|---|
| Vendor + invoice address persistence, validation, business rules | `backend-api-partner` (existing, port 3201) | internal REST `/internal/v1/vendors…` (service token + actor header) |
| Data | PostgreSQL schema `partner`, new tables `vendor`, `vendor_address`; same Prisma project and migration history | Prisma client in `src/generated/prisma` |
| Currency / country options | partner shared reference data (moved to `src/common/reference-data.ts`) | `GET /internal/v1/vendors/options` (same in-memory object as customers) |
| Browser contract, permission enforcement | gateway `src/trpc/**` | tRPC `vendor.list/get/create/update/delete/options` via `permittedProcedure("vendor", …)` |
| Session, license, grants | auth (unchanged) | existing session-context |

Partner never calls auth or reads `auth`; gateway never touches the database; no cross-schema FK.
Vendor and customer tables have **no relation** to each other.

### Backend files that change (exact list)

Partner (`backend-service` scope unless marked):

| File | Change | TODO |
|---|---|---|
| `src/common/cursor.ts` | **moved** from `src/customer/cursor.ts` unchanged (`{n,i,v:1}` keyset on `name_key,id`) | BE-VEN-001 |
| `src/common/reference-data.ts` | **moved** from `src/customer/reference-data.ts` unchanged | BE-VEN-001 |
| `src/common/partner-schemas.ts` | **new**: `optText`, `phoneSchema`, `addressBase`, `invoiceAddressInput`, `atMostOneDefault` superRefine, `listQuerySchema`, `entityIdSchema`, `LIST_LIMIT_MAX`, `MAX_ADDRESSES` (bodies copied from `customer.schemas.ts`) | BE-VEN-001 |
| `src/common/persistence.ts` | **new**: `escapeLike`, `toIso`, `normalizedKeys(tx, {name, code, email})` (PostgreSQL `lower()`), `isPrismaUnavailable`, and `persistenceErrorMapper({ entity, codeKeyIndex, notFound, codeTaken })` factory | BE-VEN-001 |
| `src/customer/customer.schemas.ts`, `customer.errors.ts`, `customer.service.ts`, `customer.controller.ts` | import the shared helpers; **exported names, shapes, codes and behavior unchanged** (customer keeps its auto-default rule) | BE-VEN-001 |
| `src/common/errors.ts` | add fixed messages for `VENDOR_NOT_FOUND`, `VENDOR_CODE_TAKEN`, `VENDOR_STALE` | BE-VEN-003 |
| `src/vendor/vendor.schemas.ts`, `vendor.errors.ts`, `vendor.service.ts`, `vendor.controller.ts` | **new** module | BE-VEN-003…005 |
| `src/app.module.ts` | register `VendorController`, `VendorService` (**integration-owned, parent-serialized**) | BE-VEN-006 |
| `prisma/schema.prisma`, `prisma/migrations/<YYYYMMDDHHMMSS>_vendor/migration.sql` | models `Vendor`, `VendorAddress` + CHECKs (**integration-owned `backend-api-partner/prisma/**`, parent-serialized; backend is the writer**) | BE-VEN-002 |

Gateway (`backend-gateway-rpc` scope):

| File | Change | TODO |
|---|---|---|
| `src/trpc/partner-schemas.ts` | **new**: shared input building blocks, `assertAtMostOneDefault(list, path)`, `listInputSchema`, `idInputSchema`, address/option output schemas, `mutationOutputSchema`, `deleteOutputSchema` | BE-VEN-007 |
| `src/trpc/customer-schemas.ts` | re-implemented on `partner-schemas.ts`; every existing export keeps its name and exact shape | BE-VEN-007 |
| `src/trpc/partner-client.ts` | `PartnerCall` gets required `notFoundCode` (replaces hard-coded `CUSTOMER_NOT_FOUND` fallback); customer calls pass `"CUSTOMER_NOT_FOUND"` | BE-VEN-007 |
| `src/trpc/vendor-schemas.ts` | **new** vendor input/output schemas | BE-VEN-008 |
| `src/trpc/router.ts` | `vendor` sub-router; `shortcutGroups` Vendor item `href: "/setup/vendor"` | BE-VEN-008 |

Not changed: partner `main.ts`, `config.ts`, `internal-auth/**`, `health/**`, `database/**`; gateway `main.ts`,
`domain-error.ts`, `auth-client.ts`; all manifests, lockfile, Dockerfiles, Compose, `.env.example`, `.github/**`.

### Partner module layout after the change

```
backend-api-partner/src/
  common/      errors.ts, exception.filter.ts, cursor.ts*, reference-data.ts*, partner-schemas.ts*, persistence.ts*
  customer/    customer.controller.ts, customer.service.ts, customer.schemas.ts, customer.errors.ts
  vendor/      vendor.controller.ts*, vendor.service.ts*, vendor.schemas.ts*, vendor.errors.ts*
  (* = new or moved)
```

## Behavior and operation

Everything not listed here is **identical to customer** ([customer architecture §1–12](../customer/architecture.md#behavior-and-operation)):
service-token guard, actor header on mutations, gateway-only authorization, double validation,
`WRITE_TX` 4 s / `maxWait` 2 s, list `READ_TX` repeatable-read read-only 2.5 s, `GREATEST(now, expected+1 ms)`
version, keyset cursor, escaped contains-`ILIKE`, stored currency/country accepted on update (D-09),
no gateway retries, 256 KB partner body limit, no PII in logs.

1. **Create:** one transaction inserts `vendor` and `vendor_address` rows (positions 1..n from array order).
   `P2002` on `vendor_code_key_key` → `409 VENDOR_CODE_TAKEN` `[{path:"code",code:"duplicate"}]`. Not idempotent.
2. **Default address (differs from customer):** stored **exactly as sent**. Zero `isDefault: true` is valid and
   stays zero; one is stored; more than one → `400 VALIDATION_ERROR` `{path:"invoiceAddresses", code:"multiple_defaults"}`
   at gateway (after the shape passes) and partner (zod `superRefine`). Partial unique index
   `vendor_address_one_default_key (vendor_id) WHERE is_default` is the backstop (`P2002` on it → 500, logged as invariant bug).
3. **Update:** full replacement with `expectedUpdatedAt` exactly as customer: read stored row (for D-09 membership),
   conditional `updateMany` on `(id, updated_at)`, 0 rows → `VENDOR_NOT_FOUND` or `VENDOR_STALE`, then
   delete + re-insert all addresses (new IDs, positions renumbered). Removing the default address in the UI simply
   sends no default; nothing is promoted.
4. **Delete:** hard, always allowed, `deleteMany({where:{id}})`, cascade removes addresses; 0 rows → `404 VENDOR_NOT_FOUND`.
   No reference check. Rule for future PO/Purchase/Payable/Memo documents: copy vendor data they display/print
   (name, code, tax ID, chosen invoice address, currency) into their own tables; keep `vendorId` without FK (ADR-0019 §4).
5. **Code Name uniqueness** is among vendors only (`vendor.code_key`); a vendor may reuse a customer's Code Name.
6. **List:** `q` contains-match on `vendor.name` OR `vendor.code`, optional `active`, order `name_key, id`, ≤ 50, `total`.
   Drawer second line is Code Name only (Q-VEN-04 default), so list items are `{id, name, code, active, updatedAt}`.
7. **Options:** `GET /internal/v1/vendors/options` returns the same frozen `OPTIONS_RESPONSE` object as customers (162 currencies on Node 24.11.0 ICU, 249 countries).
8. **Logging:** events `vendor.created|updated|deleted` with `actorId`, `vendorId`, `invoiceAddressCount`, `changedFields` (names only);
   `vendor.invariant_violation`, `vendor.db_unavailable` on errors. Never name, code, email, phone, tax ID or address text.
9. **Timeouts:** gateway → partner 3 000 ms reads (`list/get/options`), 5 000 ms writes; partner write transaction 4 000 ms.
   A timed-out create may have committed; the UI refreshes the list before allowing a resubmit (customer decision reused).

## Capacity and rollout

No Compose change. Aggregate limits stay **3.2 vCPU / 5.5 GiB of 4 vCPU / 8 GB** (postgres 1.25/2 GiB,
auth 0.5/1 GiB, gateway 0.5/768 MiB, partner 0.35/512 MiB, frontend 0.6/1 280 MiB; checked in `docker-compose.yml`
2026-10-15). Headroom ≈ 0.8 vCPU / 2.5 GB.

- **PostgreSQL connections:** unchanged. Partner pool `max 5` is shared by customer and vendor (≈ 17 of 100 total).
  Vendor screens issue at most one list page + one `get` or one write at a time per user.
- **Body limits:** partner 256 KB and gateway tRPC 1 MiB unchanged. Largest valid vendor input
  (10 addresses at maximum lengths) ≈ 12 KB JSON; `get` response ≤ ~15 KB; list page ≤ 50 × ~150 B.
- **Data size:** expected low thousands of vendors × ≤ 10 addresses → ~10 MB per 10 000 vendors. Contains-search is a
  sequential scan of `vendor` (< 10 ms below ~50 000 rows expected); `pg_trgm` not proposed.
- **Memory:** the new module adds code only; options are the shared object (~30 KB). Measured partner idle RSS
  80 MiB (customer run); re-measure after the change (BT-VEN-21), expected well under 512 MiB.
- **No cache, worker, queue, replica, volume, env var or package.**

**Rollout order:** (1) owner approves ADR-0019 + this bundle → (2) BE-VEN-001 helper extraction + customer regression
→ (3) BE-VEN-002 migration → (4) BE-VEN-003…006 partner vendor module → (5) BE-VEN-007/008 gateway
→ (6) BE-VEN-009/010 verification and handoff → (7) frontend FE-VEN-010/011. Until the partner image with the vendor
module is running, gateway `vendor.*` fails closed (an older partner answers its generic `404 NOT_FOUND` envelope, so
the UI shows an error and writes nothing), and partner `/vendors` is unreachable without gateway, so (4) and (5) can
deploy in either order; the frontend switches from its fixture adapter only after both are verified. The dashboard `href` should not ship to production before FE-VEN-002 (`/setup/vendor` route).

**Migration:** additive (`CREATE TABLE`, indexes, FK, CHECKs in schema `partner`); applied by partner's existing
start-up `prisma migrate deploy` as the schema owner (`f1_partner` in production per infra D2, `f1_user` in dev).
No backfill. **Rollback:** redeploy the previous partner/gateway images; tables remain and are ignored; full removal
only by an owner-approved forward migration (`DROP TABLE partner.vendor_address, partner.vendor`) after
`pg_dump --schema=partner`. See [database-diagram.md](database-diagram.md#migration-backfill-compatibility-rollback).

## Container infrastructure

**Not triggered.** No container, image definition, network, volume, writable path, egress, secret or environment
variable changes; the partner image only rebuilds with new source through the existing pipeline. The infra bundle
[backend-api-partner/1](../../../../infra/services/backend-api-partner/1/security.md) applies unchanged
(read-only root, uid 1000, internal networks, no egress, 0.35 vCPU / 512 MiB). The new migration runs under the same
DB role and start-up path already verified (P4/P5). The parent may note ADR-0019 in the partner row of
`document/infra/service-index.md` as "tables only, no config change"; this is not an infra review trigger.

**DevOps: not triggered.** CI lint/build/typecheck and the service-images matrix already include partner and gateway
(BE-CUS-012); no workflow, variable, build context or release requirement changes.
