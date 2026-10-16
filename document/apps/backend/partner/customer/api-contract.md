# API contract: partner + gateway / customer

- Source UI revision / SA revision: 2 / **2** (ADR-0021, approved 2026-10-16 — see [Revision 2](#revision-2--adr-0021-implemented-2026-10-16)); revision 1: 1 / 1 approved 2026-10-14
- Existing shared contracts reused unchanged: `permission.mine` (button visibility), gateway `errorFormatter` (`data.domainCode`, `data.fieldErrors`), session-context `authz` ([user-permission API](../../auth/user-permission/api-contract.md))
- Consuming frontend TODO IDs: `FE-CUS-*` in [central TODO](../../../../task/todo/customer.md) (ui-spec is writing it in parallel; the parent links exact IDs when merging `BE-CUS-*`)
- Diagrams/errors: [sequence](sequence-diagram.md), [errors](error-handling.md), [authorization](authorization.md), [database](database-diagram.md)

The browser calls only the same-origin `/api/trpc` proxy. Timestamps are RFC 3339 UTC strings
with millisecond precision (`2026-10-14T03:15:00.123Z`). IDs are UUID strings. Strings are trimmed
before length checks; an optional string that is empty after trimming becomes `null`. All input
objects are **strict** (unknown keys → `VALIDATION_ERROR`, `code: "unrecognized_keys"`).
Errors: tRPC `message` = domain code, `data.domainCode`, `data.fieldErrors: {path, code}[] | null`
(≤ 50, `path` dot-joined, e.g. `invoiceAddresses.1.postcode`).

## Shared types (zod-level)

```ts
const CURRENCY = z.string().regex(/^[A-Z]{3}$/);          // + membership in options (partner)
const COUNTRY  = z.string().regex(/^[A-Z]{2}$/);          // + membership in ISO list (partner)
const optText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();

const phoneSchema = z.object({                             // identical to user-admin-schemas.ts
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

const addressBase = {
  name:        z.string().trim().min(1).max(200),          // Invoice: "Name/Company Name"
  address:     z.string().trim().min(1).max(500),
  countryCode: COUNTRY,
  state:       z.string().trim().min(1).max(100),          // free text (ADR-0018 §4)
  city:        z.string().trim().min(1).max(100),          // free text
  postcode:    z.string().trim().min(1).max(20),
  isDefault:   z.boolean(),
};
const invoiceAddressInput  = z.object({ ...addressBase, taxId: optText(32) }).strict();
const shippingAddressInput = z.object(addressBase).strict();   // no taxId

const customerFields = {
  name:         z.string().trim().min(1).max(200),
  code:         requiredCode,                              // rev 2 (ADR-0021): "Code Name", required, trim, 1–120, unique case-insensitively
  currencyCode: CURRENCY,
  active:       z.boolean(),
  firstName:    z.string().trim().min(1).max(100),
  middleName:   optText(100),
  lastName:     optText(100),
  phone:        phoneSchema.nullable(),
  email:        z.string().trim().toLowerCase().pipe(z.email().max(254)),   // not unique
  invoiceAddresses:  z.array(invoiceAddressInput).min(1).max(10),
  shippingAddresses: z.array(shippingAddressInput).min(1).max(10),
};
// Cross-field rule (superRefine, both layers): at most one isDefault=true per array
//   → fieldError {path:"invoiceAddresses"|"shippingAddresses", code:"multiple_defaults"}.
//   Zero defaults → partner sets index 0 as default (not an error).

type Address = {
  id: string; position: number /* 1..10 */; name: string; address: string;
  countryCode: string; state: string; city: string; postcode: string; isDefault: boolean;
};
type InvoiceAddress = Address & { taxId: string | null };

type CustomerListItem = {
  id: string; name: string; code: string | null; active: boolean; updatedAt: string;
};
type CustomerDetail = CustomerListItem & {
  currencyCode: string; firstName: string; middleName: string | null; lastName: string | null;
  phone: { country: string; e164: string } | null; email: string;
  invoiceAddresses: InvoiceAddress[];   // ordered by position; exactly one isDefault
  shippingAddresses: Address[];         // ordered by position; exactly one isDefault
  createdAt: string;
};
```

## tRPC operations (gateway, browser-facing)

| Operation | Input | Output | Permission | Errors | Timeout → partner |
|---|---|---|---|---|---|
| `customer.list` query | `{ q?: z.string().trim().max(100), active?: z.boolean(), cursor?: z.string().max(200), limit?: z.number().int().min(1).max(50).default(50) }` strict | `{ items: CustomerListItem[] /* ≤ 50 */, nextCursor: string \| null, total: number }` | `customer:VIEW` | `PERMISSION_DENIED`, `VALIDATION_ERROR` (incl. bad cursor `{path:"cursor",code:"invalid"}`), `PARTNER_UNAVAILABLE` | 3 s |
| `customer.get` query | `{ id: z.uuid() }` | `CustomerDetail` | `customer:VIEW` | `CUSTOMER_NOT_FOUND`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |
| `customer.create` mutation | `z.object(customerFields).strict()` + default rule | `{ id: string, updatedAt: string }` | `customer:ADD` | `VALIDATION_ERROR`, `CUSTOMER_CODE_TAKEN`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `customer.update` mutation | `{ id: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: false, precision: 3 }), ...customerFields }` strict (full replacement) | `{ id: string, updatedAt: string }` | `customer:EDIT` | `VALIDATION_ERROR`, `CUSTOMER_NOT_FOUND`, `CUSTOMER_STALE`, `CUSTOMER_CODE_TAKEN`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `customer.delete` mutation | `{ id: z.uuid() }` | `{ ok: true }` | `customer:DELETE` | `CUSTOMER_NOT_FOUND`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `customer.options` query | none | `{ currencies: {code: string, name: string}[] /* ≤ 400 */, countries: {code: string, name: string}[] /* ≤ 300 */ }` sorted by code / by name | `customer:VIEW` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |
| `customer.nextCode` query (rev 2) | none | `{ code: string }` e.g. `"C001"` | `customer:ADD` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |

All procedures are built with `permittedProcedure("customer", action)`, which first applies
the existing `licensedProcedure` (`UNAUTHORIZED`, `LICENSE_*`). Super Admin passes every action.
Gateway validates every partner response with an output zod schema (unknown fields stripped,
arrays bounded); a malformed response → `PARTNER_UNAVAILABLE`.

Frontend notes: `options` is static per deployment (client may cache for the session);
`code` field errors on `CUSTOMER_CODE_TAKEN` arrive as `[{path:"code", code:"duplicate"}]`;
on `CUSTOMER_STALE` reload `get(id)`; Duplicate/Print/Refresh are client-only and use these
operations unchanged; Excel has no backend operation in revision 1.

## Internal REST contract (partner, called by gateway only)

Base URL `PARTNER_SERVICE_URL` (Compose `http://backend-api-partner:3201`). JSON UTF-8. Body ≤ 256 KB.

**Required headers on every `/internal/v1/**` request**

| Header | Value | Failure |
|---|---|---|
| `Authorization` | `Bearer <PARTNER_SERVICE_TOKEN>` | missing / wrong → `401 {error:{code:"UNAUTHORIZED"}}` |
| `X-Actor-User-Id` | caller user ID, `^[A-Za-z0-9_-]{1,64}$` (required on POST/PUT/DELETE, optional on GET) | invalid/missing on mutation → `400 VALIDATION_ERROR` `{path:"(header).x-actor-user-id"}` |
| `Content-Type` | `application/json` on POST/PUT | other → `415` (not expected from gateway) |

| Method / path | Request | Success | Errors |
|---|---|---|---|
| `GET /internal/v1/customers?q=&active=&cursor=&limit=` | query params as `customer.list` (`active` = `true`/`false`) | `200 {items, nextCursor, total}` | 400, 401 |
| `GET /internal/v1/customers/options` | — | `200 {currencies, countries}` | 401 |
| `GET /internal/v1/customers/next-code` (rev 2) | — | `200 {code}` | 401 |
| `GET /internal/v1/customers/:id` | UUID path | `200 CustomerDetail` | 400 (non-UUID), 401, 404 `CUSTOMER_NOT_FOUND` |
| `POST /internal/v1/customers` | `customerFields` | `201 {id, updatedAt}` | 400 `VALIDATION_ERROR`, 401, 409 `CUSTOMER_CODE_TAKEN` |
| `PUT /internal/v1/customers/:id` | `{expectedUpdatedAt, ...customerFields}` (no `id` in body) | `200 {id, updatedAt}` | 400, 401, 404, 409 `CUSTOMER_STALE` / `CUSTOMER_CODE_TAKEN` |
| `DELETE /internal/v1/customers/:id` | — | `200 {ok: true}` | 400, 401, 404 |
| `GET /health/live` | no auth | `200 {status:"ok"}` | — |
| `GET /health/ready` | no auth; `SELECT 1` with 1 s timeout | `200 {status:"ok"}` / `503 {status:"unavailable"}` | — |

Route order: `/customers/options` and `/customers/next-code` are declared before `/customers/:id`.

Error envelope (same as auth): `{ error: { code: string, message: string, fieldErrors?: {path: string, code: string}[] } }`.
`message` is a fixed English sentence per code and is never forwarded by gateway.

Partner-only validation (beyond the gateway shape): currency in the options set (or equal to the
stored value on update), country in the ISO list (or stored value), default-address rule, actor
header, cursor decode. Field-error codes used: zod issue codes, plus `duplicate` (code taken),
`unknown` (currency/country not in list), `multiple_defaults`, `invalid` (cursor).

### Cursor

`nextCursor` = base64url of JSON `{"n": <name_key>, "i": <id>, "v": 1}`. Partner rejects a cursor
that fails to decode, has another `v`, or exceeds 200 characters (`400`, path `cursor`). The
cursor is opaque to clients and carries no filter; changing `q`/`active` must restart without a cursor.

## Example (no real personal data)

```ts
// customer.create input
{ name: "SAMPLE-CUSTOMER-A", code: "C-0001 · Sample Customer A Co., Ltd.", currencyCode: "THB", active: true,
  firstName: "Sample", middleName: null, lastName: "Person", phone: { country: "TH", e164: "+66812345678" },
  email: "buyer@example.com",
  invoiceAddresses:  [{ name: "Sample Customer A Co., Ltd.", taxId: "0000000000000", address: "1 Example Road",
                        countryCode: "TH", state: "Bangkok", city: "Bang Rak", postcode: "10500", isDefault: true }],
  shippingAddresses: [{ name: "Warehouse", address: "2 Example Road", countryCode: "TH",
                        state: "Bangkok", city: "Bang Rak", postcode: "10500", isDefault: false }] }
// → { id: "8a1d…", updatedAt: "2026-10-14T03:15:00.123Z" }   (shipping #1 stored as default)
```

## Concurrency, idempotency, pagination, compatibility

- **Create:** not idempotent; the client blocks double submit. Code duplicates resolved by the unique index (concurrent creates with the same code → exactly one 201, the other 409).
- **Update:** optimistic on `expectedUpdatedAt`; stale → 409 `CUSTOMER_STALE`; whole address set replaced in the same transaction.
- **Delete:** hard; repeat → 404. No reference checks (future documents copy the name).
- **List:** keyset pagination, `limit` ≤ 50, `total` returned; ordering `lower(name), id`.
- **Compatibility:** all operations are new; no existing contract changes. Adding optional fields later is additive; output schemas in gateway strip unknown fields.

## Implementation notes (backend, 2026-10-14)

Implemented as written for SA revision 1 (approved 2026-10-14T11:45+07:00). Implemented vs proposed:

- **Implemented:** every tRPC operation and internal REST route above; partner `backend-api-partner/src/**`, migration `prisma/migrations/20261014120000_customer` (schema-qualified SQL + 9 CHECKs, partial unique index via `partialIndexes`), gateway `src/trpc/{partner-client.ts,customer-schemas.ts,router.ts}`, gateway `maxBodySize` 1 048 576 (option name verified in `@trpc/server` 11.19.0).
- **Field-error codes actually emitted:** zod 4 issue codes (`too_small`, `too_big`, `invalid_format`, `invalid_type`, `unrecognized_keys` with path `(root)` or the nested object path, e.g. `shippingAddresses.0`), plus `duplicate`, `unknown`, `multiple_defaults`, `invalid` (cursor, actor header). Non-UUID path id at partner → `{path:"id", code:"invalid_format"}`; malformed JSON → `{path:"(body)", code:"invalid_json"}`; non-JSON content type → 415 `UNSUPPORTED_MEDIA_TYPE`.
- **Default rule at gateway:** checked in the procedure after the zod shape passes (so the code stays `multiple_defaults` rather than zod's generic `custom`); same result shape as the contract.
- **Update** uses `updateMany({ where: { id, updatedAt: expected } })` with `updatedAt = max(now, expected + 1 ms)` computed in the service (allowed by database-diagram.md); `name_key`, `code_key` and `email` are lowered by PostgreSQL `lower()` in the same transaction so the CHECK constraints always hold.
- **Options:** 162 currencies on Node 24.11.0 ICU; 249 countries.
- **Additive (coordinator request 2026-10-14):** `dashboard.shortcutGroups` items have optional `href`; Customer now carries `href: "/setup/customer"` (slug unchanged). The frontend dashboard must use the `href` when it is present (it currently builds `/modules/<slug>`).

## Revision 2 — ADR-0021 (implemented 2026-10-16)

- Approval: [ADR-0021](../../../../adr/0021-partner-code-running-number-and-record-modes.md) Accepted, owner 2026-10-16 (ADR-0021 Approval evidence, ending "ทำ adr เเล้วเริ่มทำเลย"). UI revision 2, SA revision 2.
- Contract changes (everything else in this file is unchanged):

| Item | Revision 1 | Revision 2 |
|---|---|---|
| `code` in `customer.create` / `customer.update` and partner POST/PUT | `optText(120)`: optional, empty → `null` | **required**: `z.string().trim().max(120)` + empty after trim → custom issue `{path:"code", code:"required"}`. Missing / `null` / non-string → `{path:"code", code:"invalid_type"}`; > 120 → `too_big`. Same rule at gateway and partner (`requiredCodeSchema`). |
| `code` in list items / detail | `string \| null` | always a non-empty string after migration `20261016090000_partner_code_required`; the gateway output schema still accepts `null` (backward-compatible type, no `null` is produced) |
| `customer.nextCode` query | — | **new**, see below |
| Uniqueness | case-insensitive via `code_key`, many `NULL`s | unchanged rule; `NULL` no longer possible. Duplicate → 409 `CUSTOMER_CODE_TAKEN` `[{path:"code",code:"duplicate"}]` |

**`customer.nextCode`** (tRPC query, gateway)

| Input | Output | Permission | Errors | Timeout |
|---|---|---|---|---|
| none | `{ code: string }` — `^[CV][0-9]{3,19}$`, e.g. `{ code: "C001" }` | `permittedProcedure("customer", "ADD")` (Super Admin passes) | `UNAUTHORIZED`, `LICENSE_*`, `PERMISSION_DENIED` (FORBIDDEN), `PARTNER_UNAVAILABLE` (partner down/503/malformed output), `CUSTOMER_NOT_FOUND` (partner 404 fallback) | 3 s (read) |

**Partner** `GET /internal/v1/customers/next-code` (service token; actor header optional as for every GET) → `200 { "code": "C001" }`; 401 without/wrong token.
Declared before `/customers/:id`, so `next-code` is never parsed as an ID.

Rule (ADR-0021 §2): `next = max(numeric suffix of codes matching ^[Cc][0-9]+$ whose suffix has ≤ 18 significant digits) + 1`, `1` when none match;
computed in PostgreSQL as `bigint` (`substring(code FROM 2)::bigint`, the 18-digit guard prevents overflow), returned as text, formatted as
`"C" + next padded with zeros to at least 3 digits` (`C001`, `C999`, `C1000`). Codes in any other format (e.g. `C-0001`, `CM01`) are not counted.
It is a **suggestion, not a reservation**: a concurrent create with the same code gets 409 `CUSTOMER_CODE_TAKEN`; the client refetches `nextCode`.
One aggregate over the `customer` table (sequential scan; bounded by the table size, read-only, no transaction).
