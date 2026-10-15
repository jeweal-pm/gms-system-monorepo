# Service error handling: partner + gateway / vendor

- Source UI revision / SA revision: 2 / 1 (**approved** 2026-10-15)
- Frontend counterpart: [vendor error-handling.md](../../../frontend/vendor/error-handling.md) (FE-VEN-011 maps the codes below)
- Partner envelope and gateway formatter: unchanged from [customer error handling](../customer/error-handling.md)
- Gateway mapping (`callPartner`): the customer table applies unchanged, **except** the 404 fallback code is now the
  caller-supplied `notFoundCode` (`VENDOR_NOT_FOUND` for every vendor call; customer keeps `CUSTOMER_NOT_FOUND`).

## Domain codes

| Code | HTTP (partner) | tRPC code | `fieldErrors` | When |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | `BAD_REQUEST` | yes | shape, length, strict keys, >10 or 0 addresses, two defaults, unknown currency/country, bad cursor, bad actor header, malformed JSON |
| `VENDOR_NOT_FOUND` | 404 | `NOT_FOUND` | no | get/update/delete of a missing id |
| `VENDOR_CODE_TAKEN` | 409 | `CONFLICT` | `[{path:"code",code:"duplicate"}]` | Code Name used by another vendor (case-insensitive) |
| `VENDOR_STALE` | 409 | `CONFLICT` | no | `expectedUpdatedAt` differs from stored version |
| `PERMISSION_DENIED` | — (gateway 403) | `FORBIDDEN` | no | missing `vendor:<ACTION>` |
| `PARTNER_UNAVAILABLE` | 503 / network / timeout / 401 / malformed | `SERVICE_UNAVAILABLE` | no | partner unreachable or misconfigured |
| `PAYLOAD_TOO_LARGE` | 413 | `PAYLOAD_TOO_LARGE` | no | body > 256 KB at partner / > 1 MiB at gateway (not reachable with valid input) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | (not expected from gateway) | no | non-JSON POST/PUT |
| `INTERNAL_SERVER_ERROR` | 500 | `INTERNAL_SERVER_ERROR` | no | unexpected error, invariant violation |
| existing `UNAUTHORIZED`, `LICENSE_*` | gateway | existing | no | session/license |

## Scenarios

| Scenario | Domain error / status | Public contract (tRPC) | User-visible outcome (frontend doc) | Retry / idempotency | Logging |
|---|---|---|---|---|---|
| Required field empty, too long, bad email/phone/currency/country shape, unknown key (e.g. `shippingAddresses`), 0 or 11 addresses | `VALIDATION_ERROR` 400 | `BAD_REQUEST` + paths such as `invoiceAddresses.0.postcode` `too_small`, `invoiceAddresses` `too_big`, `(root)` `unrecognized_keys` | red field + message; unmapped → "Some details couldn't be saved…" banner | fix and resubmit | none |
| Two addresses marked default | `VALIDATION_ERROR` `{path:"invoiceAddresses",code:"multiple_defaults"}` | `BAD_REQUEST` | banner (UI prevents it) | fix | none |
| **No address marked default** | **not an error** — stored with zero defaults | success | none | — | none |
| Currency / country not in list (and not the stored value) | `VALIDATION_ERROR` `unknown` on `currencyCode` / `invoiceAddresses.N.countryCode` | `BAD_REQUEST` | field error; options refetched | refetch options | warn: field path only |
| Invalid list cursor | `VALIDATION_ERROR` `{path:"cursor",code:"invalid"}` | `BAD_REQUEST` | none; list restarts | restart without cursor | none |
| Missing grant | `PERMISSION_DENIED` | `FORBIDDEN` | "You don't have permission to {create/edit/delete} vendors."; `permission.mine` invalidated | — | info: actor, `vendor:ACTION` |
| Vendor not found (get) | `VENDOR_NOT_FOUND` | `NOT_FOUND` | "This vendor no longer exists. It may have been deleted." | — | none |
| Vendor not found (update) | `VENDOR_NOT_FOUND` | `NOT_FOUND` | "This vendor was deleted by someone else." Save hidden; list refreshed | — | none |
| Vendor not found (delete) | `VENDOR_NOT_FOUND` | `NOT_FOUND` | info toast "This vendor was already deleted." | treated as done | none |
| Code Name taken | `VENDOR_CODE_TAKEN` 409 | `CONFLICT` | Code Name: "This code name is already in use" | change code | none |
| Stale edit | `VENDOR_STALE` 409 | `CONFLICT` | stale banner + Reload | reload and reapply | none |
| Partner down / timeout / token rejected / malformed response | `PARTNER_UNAVAILABLE` | `SERVICE_UNAVAILABLE` | "Vendor service is unavailable. Nothing was saved. Try again." | reads: client retry ≤ 2; **mutations never retried**; after a create/update timeout the UI refetches before allowing resubmit (create may have committed) | warn: route, duration, outcome; error for 401 |
| DB pool exhausted (2 s) / transaction timeout (4 s) / connection loss | partner 503 `PARTNER_UNAVAILABLE` | `SERVICE_UNAVAILABLE` | as above | transaction rolled back | warn `vendor.db_unavailable` with Prisma code |
| `P2002` on default or position index (invariant broken) | 500 | `INTERNAL_SERVER_ERROR` | generic error | rolled back | error `vendor.invariant_violation` (index name only) |
| Unexpected exception | 500 | `INTERNAL_SERVER_ERROR` | generic error | rolled back | error with request ID, Prisma code only |

## Partner implementation rules

- `persistenceErrorMapper` (shared) for vendor: `P2002` whose target contains `vendor_code_key_key`/`code_key` →
  `VENDOR_CODE_TAKEN`; other `P2002` → 500 + `vendor.invariant_violation`; `P2025` → `VENDOR_NOT_FOUND`;
  `P1001/P1002/P1008/P1017/P2024/P2028` and pool/transaction-timeout messages → 503 `PARTNER_UNAVAILABLE`;
  everything else rethrown to the global filter (500). Customer's mapping stays byte-for-byte equivalent.
- Every write is one transaction; any failure rolls back (no partial address sets).
- No stack traces, SQL, Prisma messages, token or vendor data in responses/logs beyond field **paths**.
- `src/common/errors.ts` gets fixed messages: `VENDOR_NOT_FOUND` "The vendor was not found",
  `VENDOR_CODE_TAKEN` "This code name is already used", `VENDOR_STALE` "The vendor was changed by someone else"
  (never forwarded by gateway).

## Known existing behavior (not changed by this bundle)

The customer frontend integration recorded that gateway **input-validation** failures (tRPC's own zod parse) put the
raw zod issue JSON in the tRPC `message`, while `data.domainCode`/`data.fieldErrors` are correct. The UI never shows
`message`, and the same will apply to `vendor.*`. This is an independent, pre-existing gateway behavior; it is not
redesigned here and should be raised as an investigation item if the owner wants it changed.
