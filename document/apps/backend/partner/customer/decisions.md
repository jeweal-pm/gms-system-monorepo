# SA decisions: customer SA revision 1

- Feature ID / SA revision / source UI revision: `customer` / 1 / 1
- Status: **pending-review** (no backend code, migration, Compose edit or install authorized by this bundle yet)
- Binding input: [ADR-0018](../../../../adr/0018-customer-master-partner-service.md) revision 1, Accepted 2026-10-14 ("อนุมัติ ADR-0018")
- Bundle: [architecture](architecture.md), [API](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md)

ADR-0018 already decided the service, schema, API set, permissions, data model, hard delete,
standard lists and capacity. The table below records only the **implementation details** this
bundle adds. Approving the bundle "as written" approves every row. To change one, name its ID;
that creates SA revision 2 for the affected items only.

| ID | Detail decided here | Why | ADR-0018 relation |
|---|---|---|---|
| D-01 | Prisma migrations table lives in `partner._prisma_migrations`, selected by the `schema=partner` parameter of `PARTNER_DATABASE_URL` used by `prisma.config.ts`. Runtime strips that URL parameter and passes `{ schema: "partner" }` as the `PrismaPg` adapter option; every model also has `@@schema("partner")`. Verified as an acceptance gate (BT-CUS-00) before any other partner work merges. | Prisma's schema engine creates its migrations table in the connection's default schema (`schema` URL argument, default `public`); auth uses no parameter and therefore keeps `public._prisma_migrations`. | Detail of §1 "own migration history in schema `partner`" |
| D-02 | Case-insensitive code uniqueness via a stored normalized column `code_key = lower(code)` with a plain unique index (NULLs allowed many times); similar `name_key = lower(name)` for ordering/keyset. A CHECK keeps each key consistent with its source column. | Prisma 7 cannot model expression indexes, and a raw expression index would be reported as drift and dropped by a later `migrate dev`. Plain columns keep the schema fully Prisma-managed. | Implements "unique case-insensitive" and "`lower(name)` index" |
| D-03 | The one-default-per-type rule uses Prisma's `partialIndexes` preview feature (available since 7.4; installed 7.10.0): `@@unique([customerId, type], where: { isDefault: true })`. Fallback if `prisma migrate diff` is not empty after generation: raw SQL partial index in the migration plus a note in `schema.prisma` that future migrations must not drop it. Application code enforces the rule first in any case. | Keeps the backstop index Prisma-managed without a new package. Preview risk is limited to one index. | Implements the ADR's partial unique index |
| D-04 | Service auth header: `Authorization: Bearer <token>`; actor header `X-Actor-User-Id`. Constant-time digest compare. Partner 401 is mapped by gateway to `PARTNER_UNAVAILABLE` (never `UNAUTHORIZED`), so a token misconfiguration does not log users out. | Avoids a misleading redirect to `/login`; the token is an operator problem. | Detail of §1 |
| D-05 | `customer.update` is a **full replacement** (every field required as on create, plus `id`, `expectedUpdatedAt`). New `updatedAt = GREATEST(now(), expected + 1 ms)`. | Matches "update replaces the whole address set" and guarantees the version advances. | Detail of §2 |
| D-06 | `customer.delete` takes only `{id}` (no version check). A repeat delete returns `CUSTOMER_NOT_FOUND`; the UI treats that as already deleted. | ADR: hard delete always allowed. | Consistent |
| D-07 | List: contains-match on name/code, order `name_key, id`, opaque base64url keyset cursor, `total` in the same read-only repeatable-read transaction. | Stable paging with bounded queries. | Detail of §2 |
| D-08 | Separate address arrays in the API (`invoiceAddresses`, `shippingAddresses`); `type` and `position` are derived server-side. `taxId` exists only on invoice input (strict schemas). | Mirrors the form; prevents client-supplied type/position errors. | Consistent |
| D-09 | Stored currency/country codes remain valid on update even if no longer in the runtime list. | Node/ICU upgrades can change `Intl.supportedValuesOf("currency")`. | Detail of §4 |
| D-10 | Gateway tRPC `maxBodySize` 1 MiB globally; the 256 KB customer limit is enforced at partner (`express.json`) and by zod size bounds at gateway (valid input ≤ ~40 KB). | The tRPC Express adapter has a single body limit per middleware; a per-procedure limit would need path parsing of batched calls. | Satisfies §Capacity "256 KB on customer routes" at the service boundary |
| D-11 | Phone: same shape as user-permission (`{country, e164}` or `null`); E.164 regex only, no per-country library. | Reuse; no new package. | Consistent |

## Questions for the owner (few, real)

1. **Duplicate create after a timeout:** creates are not idempotent and Code Name is optional, so a
   create that timed out but committed can be submitted twice and produce two customers without a
   code. Revision 1 relies on the UI refreshing the list before retry. Accept (R), or add an
   optional `clientRequestId` idempotency column in this revision?
2. **DB role (with infra):** accept the shared `f1_user` for revision 1 like auth, or require a
   dedicated partner role now? (Infra bundle recommendation decides; SA has no preference beyond
   least privilege.)
