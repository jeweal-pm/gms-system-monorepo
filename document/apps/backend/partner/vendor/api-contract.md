# API contract: partner + gateway / vendor

- Source UI revision / SA revision: 3 / **2** (ADR-0021, approved 2026-10-16 — see [Revision 2](#revision-2--adr-0021-implemented-2026-10-16)); revision 1: 2 / 1 approved 2026-10-15
- Decision record: [ADR-0019](../../../../adr/0019-vendor-master.md) (Proposed)
- Existing shared contracts reused unchanged: `permission.mine`, gateway `errorFormatter` (`data.domainCode`, `data.fieldErrors`), session-context `authz`, partner error envelope and internal headers from the [customer contract](../customer/api-contract.md#internal-rest-contract-partner-called-by-gateway-only)
- Consuming frontend TODO IDs: FE-VEN-002 (dashboard `href`), FE-VEN-005…008 (rules/shapes), FE-VEN-010 (wiring), FE-VEN-011 (error mapping) in the [central TODO](../../../../task/todo/vendor.md); frontend needs in [data-fetching.md](../../../frontend/vendor/data-fetching.md#requirements-for-the-sa-bundle) SA-VEN-01…08
- Diagrams/errors: [sequence](sequence-diagram.md), [errors](error-handling.md), [authorization](authorization.md), [database](database-diagram.md)

Conventions are the customer ones: browser calls only `/api/trpc`; timestamps RFC 3339 UTC with milliseconds;
IDs UUID strings; strings trimmed before length checks; an optional string empty after trimming becomes `null`;
every input object is **strict** (unknown keys → `VALIDATION_ERROR`, `unrecognized_keys`); errors carry
tRPC `message` = domain code, `data.domainCode`, `data.fieldErrors: {path, code}[] | null` (≤ 50, dot-joined,
0-based, e.g. `invoiceAddresses.1.postcode`).

## Shared types (zod-level)

The building blocks are the customer ones, moved without change into `partner-schemas.ts` (gateway) and
`src/common/partner-schemas.ts` (partner) so both entities use one definition.

```ts
// shared (unchanged from customer)
const CURRENCY = z.string().regex(/^[A-Z]{3}$/);          // + membership in options (partner)
const COUNTRY  = z.string().regex(/^[A-Z]{2}$/);          // + membership in ISO list (partner)
const optText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();
const phoneSchema = z.object({ country: z.string().regex(/^[A-Z]{2}$/),
                               e164: z.string().regex(/^\+[1-9]\d{6,14}$/) }).strict();
const invoiceAddressInput = z.object({
  name:        z.string().trim().min(1).max(200),          // "Name/Company Name"
  taxId:       optText(32),
  address:     z.string().trim().min(1).max(500),
  countryCode: COUNTRY,
  state:       z.string().trim().min(1).max(100),          // free text (ADR-0018 §4)
  city:        z.string().trim().max(100),                 // optional ("" when empty, owner 2026-10-19)
  postcode:    z.string().trim().min(1).max(20),
  isDefault:   z.boolean(),                               // required; false for new items (UI)
}).strict();

// vendor
const vendorFields = {
  name:         z.string().trim().min(1).max(200),
  code:         requiredCode,                              // rev 2 (ADR-0021): "Code Name", required, trim, 1–120, unique case-insensitively among vendors
  currencyCode: CURRENCY,
  active:       z.boolean(),
  firstName:    z.string().trim().min(1).max(100),
  middleName:   optText(100),
  lastName:     optText(100),
  phone:        phoneSchema.nullable(),                    // optional (Q-VEN-02)
  email:        z.string().trim().toLowerCase().pipe(z.email().max(254)),   // not unique
  invoiceAddresses: z.array(invoiceAddressInput).min(1).max(10),
};
// Cross-field rule (both layers): at most one isDefault=true
//   → fieldError {path:"invoiceAddresses", code:"multiple_defaults"}.
//   ZERO defaults is VALID and is stored as zero (no automatic default — differs from customer).
// There is no shippingAddresses key: sending one → VALIDATION_ERROR {path:"(root)", code:"unrecognized_keys"}.

type VendorInvoiceAddress = {
  id: string; position: number /* 1..10 */; name: string; taxId: string | null; address: string;
  countryCode: string; state: string; city: string; postcode: string; isDefault: boolean;
};
type VendorListItem = { id: string; name: string; code: string | null; active: boolean; updatedAt: string };
type VendorDetail = VendorListItem & {
  currencyCode: string; firstName: string; middleName: string | null; lastName: string | null;
  phone: { country: string; e164: string } | null; email: string;
  invoiceAddresses: VendorInvoiceAddress[];   // ordered by position; 1..10 items; zero or one isDefault
  createdAt: string;
};
```

## tRPC operations (gateway, browser-facing)

| Operation | Input | Output | Permission | Errors | Timeout → partner |
|---|---|---|---|---|---|
| `vendor.list` query | `{ q?: z.string().trim().max(100), active?: z.boolean(), cursor?: z.string().max(200).nullish(), direction?: z.enum(["forward","backward"]), limit?: z.number().int().min(1).max(50).default(50) }` strict (`cursor`/`direction` accepted for `useInfiniteQuery`; `direction` ignored) | `{ items: VendorListItem[] /* ≤ 50 */, nextCursor: string \| null, total: number }` | `vendor:VIEW` | `PERMISSION_DENIED`, `VALIDATION_ERROR` (incl. `{path:"cursor",code:"invalid"}`), `PARTNER_UNAVAILABLE` | 3 s |
| `vendor.get` query | `{ id: z.uuid() }` strict | `VendorDetail` | `vendor:VIEW` | `VENDOR_NOT_FOUND`, `VALIDATION_ERROR`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |
| `vendor.create` mutation | `z.object(vendorFields).strict()` + default rule | `{ id: string, updatedAt: string }` | `vendor:ADD` | `VALIDATION_ERROR`, `VENDOR_CODE_TAKEN`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `vendor.update` mutation | `{ id: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: false, precision: 3 }), ...vendorFields }` strict (full replacement) | `{ id: string, updatedAt: string }` | `vendor:EDIT` | `VALIDATION_ERROR`, `VENDOR_NOT_FOUND`, `VENDOR_STALE`, `VENDOR_CODE_TAKEN`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `vendor.delete` mutation | `{ id: z.uuid() }` strict | `{ ok: true }` | `vendor:DELETE` | `VENDOR_NOT_FOUND`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `vendor.options` query | none | `{ currencies: {code, name}[] /* ≤ 400, by code */, countries: {code, name}[] /* ≤ 300, by name */ }` | `vendor:VIEW` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |
| `vendor.nextCode` query (rev 2) | none | `{ code: string }` e.g. `"V001"` | `vendor:ADD` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |

All procedures use `permittedProcedure("vendor", action)` (license check first: `UNAUTHORIZED`, `LICENSE_*`);
Super Admin passes every action. `customer:*` grants give **no** access to `vendor.*`. Gateway validates every
partner response with an output schema (unknown fields stripped, arrays bounded: `items` ≤ 50,
`invoiceAddresses` ≤ 10, positions 1..10); malformed → `PARTNER_UNAVAILABLE`. Every vendor `callPartner` call passes
`notFoundCode: "VENDOR_NOT_FOUND"`.

`vendor.options` returns exactly the same lists as `customer.options` (same partner object); the client may cache it
for the session (`staleTime: Infinity`). The frontend may share one options cache only if it keys it per procedure.

**Dashboard (additive, SA-VEN-06):** `dashboard.shortcutGroups` Partner Master › Vendor becomes
`{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }`; slug unchanged; Customer unchanged.

Frontend notes: on `VENDOR_CODE_TAKEN` the field error is `[{path:"code", code:"duplicate"}]`; on `VENDOR_STALE`
reload `get(id)`; `multiple_defaults` arrives on path `invoiceAddresses` (cannot happen with the UI's single-tick
control); `unknown` on `currencyCode` / `invoiceAddresses.N.countryCode` means "reload options". Duplicate, Print and
Refresh are client-only; Excel has no operation.

## Internal REST contract (partner, called by gateway only)

Base URL `PARTNER_SERVICE_URL`, headers (`Authorization: Bearer <PARTNER_SERVICE_TOKEN>`, `X-Actor-User-Id` required on
POST/PUT/DELETE, `Content-Type: application/json` on POST/PUT), envelope `{error:{code, message, fieldErrors?}}`,
256 KB body limit, `415`/`invalid_json` handling and health routes are **exactly** as in the
[customer contract](../customer/api-contract.md#internal-rest-contract-partner-called-by-gateway-only).

| Method / path | Request | Success | Errors |
|---|---|---|---|
| `GET /internal/v1/vendors?q=&active=&cursor=&limit=` | as `vendor.list` (`active` = `true`/`false`; `limit` string 1–50) | `200 {items, nextCursor, total}` | 400, 401 |
| `GET /internal/v1/vendors/options` | — | `200 {currencies, countries}` | 401 |
| `GET /internal/v1/vendors/next-code` (rev 2) | — | `200 {code}` | 401 |
| `GET /internal/v1/vendors/:id` | UUID path | `200 VendorDetail` | 400 `{path:"id",code:"invalid_format"}`, 401, 404 `VENDOR_NOT_FOUND` |
| `POST /internal/v1/vendors` | `vendorFields` | `201 {id, updatedAt}` | 400 `VALIDATION_ERROR`, 401, 409 `VENDOR_CODE_TAKEN`, 413, 415 |
| `PUT /internal/v1/vendors/:id` | `{expectedUpdatedAt, ...vendorFields}` (no `id` in body) | `200 {id, updatedAt}` | 400, 401, 404, 409 `VENDOR_STALE` / `VENDOR_CODE_TAKEN`, 413, 415 |
| `DELETE /internal/v1/vendors/:id` | — | `200 {ok: true}` | 400, 401, 404 |

Route order: `/vendors/options` and `/vendors/next-code` are declared before `/vendors/:id`.

Partner-only validation (beyond the gateway shape): currency in the options set (or equal to the stored value on
update), every `countryCode` in the ISO list (or among this vendor's stored address countries on update), default
rule, actor header, cursor decode. Field-error codes: zod 4 issue codes plus `duplicate`, `unknown`,
`multiple_defaults`, `invalid`.

### Cursor

Same format as customer: base64url of `{"n": <name_key>, "i": <id>, "v": 1}`, ≤ 200 characters, opaque, carries no
filter; changing `q`/`active` restarts without a cursor. A customer cursor decodes as a vendor cursor without error
(same format) but only positions the keyset; it cannot leak data.

## Example (no real personal data)

```ts
// vendor.create input — no default chosen (valid)
{ name: "SAMPLE-VENDOR-A", code: "V-0001", currencyCode: "THB", active: true,
  firstName: "Sample", middleName: null, lastName: "Person", phone: null,
  email: "sales@example.com",
  invoiceAddresses: [{ name: "Sample Vendor A Co., Ltd.", taxId: "0000000000000", address: "1 Example Road",
                       countryCode: "TH", state: "Bangkok", city: "Bang Rak", postcode: "10500", isDefault: false }] }
// → { id: "3f2c…", updatedAt: "2026-10-15T03:15:00.123Z" }
// vendor.get → invoiceAddresses[0].isDefault === false (nothing promoted)
```

## Concurrency, idempotency, pagination, compatibility

- **Create:** not idempotent; client blocks double submit; concurrent same code → one 201, one 409.
- **Update:** optimistic on `expectedUpdatedAt`; stale → 409 `VENDOR_STALE`; whole address set replaced in one transaction (new address IDs each save).
- **Delete:** hard; repeat → 404. No reference checks (future purchase documents copy vendor data, ADR-0019 §4).
- **List:** keyset, `limit` ≤ 50, `total`, order `lower(name), id`.
- **Compatibility:** all `vendor.*` operations are new. Customer operations, shapes and codes are unchanged by the helper
  extraction. `dashboard.shortcutGroups` change is additive. `callPartner`'s new `notFoundCode` parameter is internal.

## Implementation notes (backend, 2026-10-15)

Implemented as specified: every operation, shape, permission, error code, field path, bound and timeout in this file
is unchanged by the implementation (verified at runtime, [testing.md results](testing.md#results--backend-run-2026-10-15-branch-feat14-10-26-vendor)).
Handoff: [vendor-backend.md](../../../../coordination/handoffs/vendor-backend.md).

| Item | Proposed | Implemented | Contract impact |
|---|---|---|---|
| Migration | `<timestamp>_vendor` via `migrate dev --create-only` | `prisma/migrations/20261015031643_vendor/migration.sql`, SQL produced with `prisma migrate diff --from-config-datasource` (no shadow DB needed), table names schema-qualified `"partner".…` by hand (as the customer migration), 8 CHECKs appended; partial unique index from the `partialIndexes` preview (fallback not needed; post-deploy diff empty) | none |
| Partner `src/common/` | `cursor.ts`, `reference-data.ts` moved; `partner-schemas.ts`; `persistence.ts` | as proposed (moved files byte-identical except the `./errors` import), plus: `partner-schemas.ts` also holds `partnerScalarFields`, `expectedUpdatedAtSchema`, `membershipErrors`; `persistence.ts` also holds `WRITE_TX`/`READ_TX`, `SCALAR_FIELDS`, `scalarData`, `scalarDetail`, `addressDetail` and the shared keyset `listPage(table, …)` (fixed table identifiers only); new `request.ts` (`parseId`, `requireJson`). Vendor duplicates no customer logic | none |
| `persistenceErrorMapper` option | `codeKeyIndex` | `codeKeyMarker: "code_key"` (matches the `vendor_code_key_key`/`customer_code_key_key` index and the `code_key` field; exactly the customer's previous check) | none |
| Gateway `assertAtMostOneDefault` | `(list, path)` | `assertAtMostOneDefault({ [path]: list, … })` so customer keeps reporting both arrays in one error; wrappers `assertSingleDefaults` (customer, unchanged export) and `assertVendorDefaults` | none |
| Gateway `partner-schemas.ts` | blocks, list/id inputs, outputs | as proposed, plus `partnerScalarFields`, `updateMetaFields`, `detailScalarOutput`, `invoiceAddressOutputSchema`, `listQueryString` (customer and vendor list use it) | none |
| `callPartner` | required `notFoundCode` | as proposed; 6 customer calls pass `CUSTOMER_NOT_FOUND`, 6 vendor calls `VENDOR_NOT_FOUND` | internal only |
| 404 from an older partner image | "fails closed" | confirmed: an older partner's generic envelope yields `NOT_FOUND` with `domainCode` `"NOT_FOUND"` (the upstream code is recognized, so `notFoundCode` is not used) | frontend treats unknown codes generically |
| Logs | `vendor.created/updated/deleted` | as proposed; `vendor.created` carries `invoiceAddressCount`; `vendor.updated` carries `changedFields`, `addressesReplaced`, `invoiceAddressCount` | none |

No deviation from the approved API, schema, flow or dependencies; no package added.

## Revision 2 — ADR-0021 (implemented 2026-10-16)

- Approval: [ADR-0021](../../../../adr/0021-partner-code-running-number-and-record-modes.md) Accepted, owner 2026-10-16 (ADR-0021 Approval evidence, ending "ทำ adr เเล้วเริ่มทำเลย"). UI revision 3, SA revision 2.
- Contract changes (everything else in this file is unchanged):

| Item | Revision 1 | Revision 2 |
|---|---|---|
| `code` in `vendor.create` / `vendor.update` and partner POST/PUT | `optText(120)`: optional, empty → `null` | **required**: `z.string().trim().max(120)` + empty after trim → custom issue `{path:"code", code:"required"}`. Missing / `null` / non-string → `{path:"code", code:"invalid_type"}`; > 120 → `too_big`. Same rule at gateway and partner (`requiredCodeSchema`). |
| `code` in list items / detail | `string \| null` | always a non-empty string after migration `20261016090000_partner_code_required`; the gateway output schema still accepts `null` (backward-compatible type, no `null` is produced) |
| `vendor.nextCode` query | — | **new**, see below |
| Uniqueness | case-insensitive via `code_key`, many `NULL`s | unchanged rule; `NULL` no longer possible. Duplicate → 409 `VENDOR_CODE_TAKEN` `[{path:"code",code:"duplicate"}]` |

**`vendor.nextCode`** (tRPC query, gateway)

| Input | Output | Permission | Errors | Timeout |
|---|---|---|---|---|
| none | `{ code: string }` — `^[CV][0-9]{3,19}$`, e.g. `{ code: "V001" }` | `permittedProcedure("vendor", "ADD")` (Super Admin passes) | `UNAUTHORIZED`, `LICENSE_*`, `PERMISSION_DENIED` (FORBIDDEN), `PARTNER_UNAVAILABLE` (partner down/503/malformed output), `VENDOR_NOT_FOUND` (partner 404 fallback) | 3 s (read) |

**Partner** `GET /internal/v1/vendors/next-code` (service token; actor header optional as for every GET) → `200 { "code": "V001" }`; 401 without/wrong token.
Declared before `/vendors/:id`, so `next-code` is never parsed as an ID.

Rule (ADR-0021 §2): `next = max(numeric suffix of codes matching ^[Vv][0-9]+$ whose suffix has ≤ 18 significant digits) + 1`, `1` when none match;
computed in PostgreSQL as `bigint` (`substring(code FROM 2)::bigint`, the 18-digit guard prevents overflow), returned as text, formatted as
`"V" + next padded with zeros to at least 3 digits` (`V001`, `V999`, `V1000`). Codes in any other format (e.g. `V-0001`, `VM01`) are not counted.
It is a **suggestion, not a reservation**: a concurrent create with the same code gets 409 `VENDOR_CODE_TAKEN`; the client refetches `nextCode`.
One aggregate over the `vendor` table (sequential scan; bounded by the table size, read-only, no transaction).
