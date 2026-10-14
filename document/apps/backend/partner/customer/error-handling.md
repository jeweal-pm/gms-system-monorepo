# Service error handling: partner + gateway / customer

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Frontend counterpart: `document/apps/frontend/customer/error-handling.md` (ui-spec, in progress)
- Partner envelope (same as auth): `{error:{code, message, fieldErrors?: {path, code}[]}}`, `fieldErrors` ≤ 50
- Gateway: `domainError(trpcCode, domainCode, fieldErrors)` from `src/trpc/domain-error.ts` (existing); the
  existing `errorFormatter` puts `domainCode` and `fieldErrors` into `shape.data`. A new
  `src/trpc/partner-client.ts` (`callPartner`) mirrors `callAuth` with partner-specific mapping below.

## Gateway mapping of partner responses (`callPartner`)

| Partner result | tRPC code | `domainCode` | Field errors forwarded |
|---|---|---|---|
| 400 | `BAD_REQUEST` | upstream code (`VALIDATION_ERROR`) | yes (sanitized) |
| 401 | `SERVICE_UNAVAILABLE` | `PARTNER_UNAVAILABLE` (logged as error; **never** `UNAUTHORIZED`) | no |
| 403 (not expected) | `SERVICE_UNAVAILABLE` | `PARTNER_UNAVAILABLE` | no |
| 404 | `NOT_FOUND` | upstream (`CUSTOMER_NOT_FOUND`), fallback `CUSTOMER_NOT_FOUND` | no |
| 409 | `CONFLICT` | upstream (`CUSTOMER_CODE_TAKEN` / `CUSTOMER_STALE`) | yes |
| 413 | `PAYLOAD_TOO_LARGE` | `PAYLOAD_TOO_LARGE` | no |
| 503, network error, DNS, `AbortSignal.timeout`, body > 1 MiB, non-JSON, output-schema mismatch | `SERVICE_UNAVAILABLE` | `PARTNER_UNAVAILABLE` | no |
| other 5xx | `INTERNAL_SERVER_ERROR` | `INTERNAL_SERVER_ERROR` | no |

Upstream `message` text is never forwarded. Domain codes must match the existing
`DOMAIN_CODE_PATTERN` (`^[A-Z][A-Z_]{1,63}$`). ADR-0018 lists `PARTNER_UNAVAILABLE` as 502/503;
gateway uses the tRPC `SERVICE_UNAVAILABLE` (HTTP 503) for every unavailability case, because tRPC
has no 502 code (`BAD_GATEWAY` exists in tRPC 11 but would split the frontend handling for no benefit).

## Scenarios

| Scenario | Domain error / status | Public contract (tRPC) | User-visible outcome | Retry / idempotency | Logging |
|---|---|---|---|---|---|
| Missing required field, too long, bad email/phone/currency/country shape, unknown key, > 10 addresses, 0 invoice or 0 shipping address | `VALIDATION_ERROR` 400 | `BAD_REQUEST` + `fieldErrors` (e.g. `invoiceAddresses.0.postcode` `too_small`) | red field + message per design | fix and resubmit | none (expected) |
| More than one default in a type | `VALIDATION_ERROR` 400 `{path:"invoiceAddresses", code:"multiple_defaults"}` | `BAD_REQUEST` | message under the address section | fix | none |
| Currency / country not in list | `VALIDATION_ERROR` 400 `{path:"currencyCode"\|"…countryCode", code:"unknown"}` | `BAD_REQUEST` | field error; reload options | refetch options | warn: field name only |
| Invalid list cursor | `VALIDATION_ERROR` 400 `{path:"cursor", code:"invalid"}` | `BAD_REQUEST` | none (client restarts list) | restart without cursor | none |
| No session | 401 (gateway) | `UNAUTHORIZED` | existing redirect to /login | — | existing |
| Caller license restricted | existing `LICENSE_*` | existing | existing license routing | — | existing |
| Missing grant | `PERMISSION_DENIED` 403 (gateway) | `FORBIDDEN` | access-denied state / action hidden | — | info: actor, `customer:ACTION` |
| Customer not found (get/update/delete) | `CUSTOMER_NOT_FOUND` 404 | `NOT_FOUND` | toast "This customer no longer exists"; list refetch; delete treats it as done | — | none |
| Code Name already used (any case) | `CUSTOMER_CODE_TAKEN` 409 `{path:"code",code:"duplicate"}` | `CONFLICT` | Code Name field error | change code | none |
| Stale edit | `CUSTOMER_STALE` 409 | `CONFLICT` | "This customer was changed by someone else. Reload?" → `get(id)` | reload and reapply | none |
| Body over 256 KB at partner | 413 | `PAYLOAD_TOO_LARGE` | generic error (cannot happen with valid input) | — | warn |
| Partner down / timeout / token rejected / malformed response | `PARTNER_UNAVAILABLE` | `SERVICE_UNAVAILABLE` | "Couldn't reach customer service. Try again." | reads: client retry allowed; **mutations not retried by gateway**; after a create/update timeout the UI refetches the list/record before allowing resubmit (a create may have committed) | warn: route, duration, outcome; error for 401 ("partner rejected service token") |
| DB pool exhausted (`connectionTimeoutMillis` 2 s) or transaction timeout (4 s) | 503 `PARTNER_UNAVAILABLE` from partner | `SERVICE_UNAVAILABLE` | as above | transaction rolled back; nothing written | warn with request ID |
| DB error / unexpected exception | 500 `INTERNAL_SERVER_ERROR` | `INTERNAL_SERVER_ERROR` | generic error | transaction rolled back | error with request ID, Prisma error code only, no values |

## Partner implementation rules

- Map Prisma errors explicitly: `P2002` on `code_key` → `CUSTOMER_CODE_TAKEN`; `P2002` on the default
  or position index → 500 (application rules should make it impossible; log as bug); `P2025` → `CUSTOMER_NOT_FOUND`;
  `P2024` (pool timeout) and transaction timeout → 503 `PARTNER_UNAVAILABLE`; everything else → 500.
- Every write is one transaction; any failure rolls back fully (no partial address sets).
- A global Nest exception filter converts unknown errors to the envelope without stack traces.
- No stack traces, raw SQL, Prisma messages, service token, or customer personal data (names, codes,
  emails, phones, tax IDs, addresses) in responses or logs, beyond echoing field **paths** in `fieldErrors`.
- Every partner log line carries the pino-http request ID; gateway logs the partner route and status.
