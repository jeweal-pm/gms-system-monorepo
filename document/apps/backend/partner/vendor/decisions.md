# SA decisions: vendor SA revision 1

- Feature ID / SA revision / source UI revision: `vendor` / 1 / 2 (UI approved 2026-10-15)
- Status: **approved** 2026-10-15
- approved-revision: SA revision 1 + ADR-0019 revision 1 · approved-by: project owner · approved-at: 2026-10-15T11:00+07:00 · approval-evidence: owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1"
- Decision record: [ADR-0019](../../../../adr/0019-vendor-master.md) revision 1, **Proposed**
- Bundle: [architecture](architecture.md), [API](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), [vendor-flow](../../../../diagram/vendor-flow.md), central TODO rows BE-VEN-001…010 in [vendor.md](../../../../task/todo/vendor.md#backend-items-be-ven-)

## Owner decisions recorded (already given, not re-asked)

| Source | Decision | Where applied |
|---|---|---|
| Owner 2026-10-15 + UI rev 2 | Vendor = Customer with **invoice addresses only** (1..10), no shipping | ADR-0019 §3, D-V02 |
| Q-VEN-01 | Labels and field set identical to Customer | api-contract `vendorFields` |
| Q-VEN-02 | Phone **optional** | `phone: phoneSchema.nullable()` |
| Q-VEN-03 " default ไม่ต้องติ๊ก" | Default invoice address **optional**: 0 or 1; new items unchecked; > 1 invalid | D-V03 |
| Q-VEN-04 (documented default) | Drawer: Name bold, Code Name second line | list item `{id,name,code,active,updatedAt}` |
| Q-VEN-06 (documented default) | No extra fields | — |
| Parent instruction | Permanent delete like Customer unless a strong reason; record the PO/Purchase copy rule | D-V05 |
| Parent instruction | Dashboard Vendor `href: "/setup/vendor"` | D-V08 |

## Decisions in this revision (approve "as written", or name an ID to change it)

| ID | Decision | Why | Answers |
|---|---|---|---|
| D-V01 | New **ADR-0019** (Proposed) instead of revising Accepted ADR-0018 | ADR-0018 rev 1 is approved and implemented; a revision would reopen Customer's approval scope. ADR-0019 records only what is new and cites ADR-0018 for what is reused. | SA-VEN-01 |
| D-V02 | Separate tables `partner.vendor` and `partner.vendor_address` (no `type` column), new migration in the existing partner Prisma project | No migration of the live customer tables; invoice-only per owner; adding shipping later is an additive migration | SA-VEN-01 |
| D-V03 | Default stored **exactly as sent**: zero allowed and kept; one allowed; more than one → `VALIDATION_ERROR` `multiple_defaults` on `invoiceAddresses`; partial unique `(vendor_id) WHERE is_default` as backstop | Q-VEN-03; differs deliberately from customer's auto-default | SA-VEN-03 |
| D-V04 | **`vendor.options`** (guarded by `vendor:VIEW`) backed by the same in-memory partner lists as `customer.options`, via `GET /internal/v1/vendors/options` | A user with only `vendor:VIEW` must load options; `permittedProcedure` checks one exact menu grant (ADR-0016); a shared "any-of" procedure would need new middleware and change the customer contract | SA-VEN-04 |
| D-V05 | Hard delete always allowed (cascade). Future PO / Purchase (PU) / Payable / Memo documents must **copy** vendor data they show/print (name, Code Name, tax ID, chosen invoice address, currency) and keep `vendorId` without FK | Same as customer; documents live in other schemas (no cross-schema FK per ADR-0001), so blocking deletes would need a cross-service check that has nothing to check yet | SA-VEN-05 |
| D-V06 | Error codes `VENDOR_NOT_FOUND` 404, `VENDOR_CODE_TAKEN` 409 (`code`/`duplicate`), `VENDOR_STALE` 409, `VALIDATION_ERROR` 400 (`invoiceAddresses.N.field`), `PARTNER_UNAVAILABLE`, `PERMISSION_DENIED`; `callPartner` takes a `notFoundCode` instead of the hard-coded `CUSTOMER_NOT_FOUND` | Mirrors customer; prevents a vendor 404 being reported as a customer code | SA-VEN-05 |
| D-V07 | Code Name unique **among vendors only** (own `vendor.code_key` unique index) | A company can be both a customer and a vendor with the same code | SA-VEN-03 |
| D-V08 | Gateway `shortcutGroups` Vendor gets `href: "/setup/vendor"` (additive); ship to production no earlier than the FE-VEN-002 route | Same mechanism as customer | SA-VEN-06 |
| D-V09 | **Reuse by extraction, not copy:** partner helpers move to `src/common/` (cursor, reference data, zod building blocks, persistence helpers, error-mapper factory); gateway shared schemas move to `src/trpc/partner-schemas.ts`. Customer exports/behavior unchanged and re-verified (BT-VEN-18) | Owner preference for reuse; one fix location for both entities | SA-VEN-02 |
| D-V10 | Capacity: no new container, env, network, volume or package; pool `max 5` shared; partner body 256 KB and gateway 1 MiB unchanged; Compose total stays 3.2 vCPU / 5.5 GiB; infra and devops **not triggered** | Vendor only adds tables and code to an existing service | SA-VEN-07 |
| D-V11 | `vendor-flow.md` refined with service-level notes; sequences live only in [sequence-diagram.md](sequence-diagram.md) | Avoid duplicated diagrams | SA-VEN-08 |

Reused unchanged from customer SA revision 1 (no new decision): D-01 migrations table, D-02 `name_key`/`code_key`
columns, D-03 `partialIndexes` + fallback, D-04 service auth headers and 401 → `PARTNER_UNAVAILABLE`, D-05 full
replacement + `GREATEST` version, D-06 delete by id without version, D-07 list/cursor, D-09 stored currency/country
stay valid, D-10 body limits, D-11 phone shape; the owner's customer choice "refresh the list before retrying a
timed-out create, no idempotency key".

## Open questions

None blocking. Optional for the owner: should a later Purchase Order ADR **block** deleting a vendor that has open
documents (deactivate instead)? This bundle does not need the answer (D-V05 keeps delete always allowed).

## Backend handoff (use only after the owner approves this exact revision)

- Feature / revisions: `vendor`, UI revision 2, **SA revision 1**, ADR-0019 revision 1; record the owner's approval
  words in the TODO header and the BE-VEN section before starting.
- TODO IDs: BE-VEN-001…010 in [vendor.md](../../../../task/todo/vendor.md#backend-items-be-ven-), in dependency order.
- Contracts / diagrams: this bundle (api-contract is authoritative for shapes and codes).
- Allowed paths: `backend-api-partner/src/{common,customer,vendor}/**`; `backend-api-partner/prisma/**` and
  `backend-api-partner/src/app.module.ts` (integration-owned; parent assigns backend as the single writer);
  `backend-api-gateway/src/trpc/{partner-schemas.ts,customer-schemas.ts,vendor-schemas.ts,partner-client.ts,router.ts}`;
  `document/apps/backend/partner/vendor/{api-contract.md,testing.md}` (implementation notes and results only).
  No manifests, lockfile, Dockerfiles, Compose, `.env.example`, `.github/**`, auth or frontend files.
- Capacity constraints: pool `max 5`; list ≤ 50; addresses ≤ 10; transactions 4 s write / 2.5 s list read;
  gateway timeouts 3 s / 5 s; no retries, caches or new processes.
- Verification: BT-VEN-00…21 per [testing.md](testing.md); BT-VEN-18 customer regression is mandatory before
  BE-VEN-003 starts and again at the end.
- Return to the parent: `document/coordination/handoffs/vendor-backend.md` with the actual contract, deviations and
  check results, so frontend can continue FE-VEN-010/011 (and FE-VEN-002's dashboard link).
- Corrective work: none open; if a defect arises, one root-cause ledger per [remediation](../../../../workflow/remediation.md), 3 passes total.
