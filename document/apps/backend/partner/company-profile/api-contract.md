# API contract: company-profile (SA 2, approved)

> Revision 2 changes storage only (logo file instead of a table). Routes, shapes and errors are unchanged.

All browser calls go through the Next same-origin proxies (`/api/trpc`, `/api/v1`) to the gateway; the gateway checks the session and `company-profile:*` permissions and calls partner with `PARTNER_SERVICE_TOKEN` + actor id (as vendor/customer). Partner is never reachable from the browser.

## Shared types (Zod, gateway and partner)

```ts
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
const Phone = z.object({ country: z.string().regex(/^[A-Z]{2}$/), e164: z.string().regex(/^\+[1-9]\d{6,14}$/) }); // existing phoneSchema
const Href = z.string().max(2048).regex(/^(https?:\/\/\S+|mailto:[^\s@]+@[^\s@]+)$/i);

// Rich text (SA-CP-03): ProseMirror JSON, strict, recursive; depth ≤ 8, ≤ 2,000 nodes (checked after parse).
const Mark = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["bold", "italic", "strike", "code"]) }).strict(),
  z.object({ type: z.literal("link"), attrs: z.object({ href: Href }).passthrough() }).strict(),
]);
// Node: { type: "doc"|"paragraph"|"text"|"hardBreak"|"bulletList"|"orderedList"|"listItem"|"codeBlock", content?: Node[], text?: string (≤ 10,000), marks?: Mark[], attrs?: object }
// Unknown node/mark types, unknown keys (besides attrs) → VALIDATION_ERROR. attrs are dropped except link.href, orderedList.start (int 1..10,000), codeBlock.language (≤ 32, [a-z0-9-]) .
type RichText = { type: "doc"; content: Node[] } | null; // null = empty

const CompanyProfileInput = z.object({
  name: required(200),
  taxId: text(50),
  contactName: required(200),
  phone: Phone,
  email: z.email().max(254),
  website: z.union([z.literal(""), z.string().max(300).regex(/^https?:\/\/\S+$/i)]),
  address: required(300),
  address2: text(300),
  countryCode: z.string().regex(/^[A-Z]{2}$/),   // + membership in COUNTRY_CODES (partner)
  state: required(100),
  city: z.string().trim().max(100),                       // optional, "" when empty (owner 2026-10-19)
  postcode: required(20),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),  // + membership in CURRENCY_CODES (partner)
  bankDetails: RichText,                          // plain-text length ≤ 5,000
  showBankDetailsOnInvoice: z.boolean(),
  terms: RichText,                                // plain-text length ≤ 10,000
  showTermsOnInvoice: z.boolean(),
}).strict();

type Logo = { version: string /* sha256 first 16 hex */; contentType: "image/jpeg" | "image/png"; sizeBytes: number } | null;
type CompanyProfile = z.infer<typeof CompanyProfileInput> & { version: number; logo: Logo; updatedAt: string /* ISO */; updatedBy: string | null };
```

## tRPC operations (gateway, browser-facing)

| Operation | Input | Output | Permission | Errors | Timeout |
|---|---|---|---|---|---|
| `companyProfile.get` query | none | `{ profile: CompanyProfile \| null }` | `company-profile:VIEW` | `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 3 s |
| `companyProfile.options` query | none | `{ currencies: {code,name}[], countries: {code,name}[] }` (same lists as `vendor.options`) | `company-profile:VIEW` | as above | 3 s |
| `companyProfile.save` mutation | `CompanyProfileInput & { expectedVersion: number \| null }` | `{ profile: CompanyProfile }` | `company-profile:EDIT` | `VALIDATION_ERROR` (fieldErrors with paths), `CONFLICT`, `PERMISSION_DENIED`, `PARTNER_UNAVAILABLE` | 5 s |
| `companyProfile.removeLogo` mutation | `{ expectedVersion: number }` | `{ profile: CompanyProfile }` | `company-profile:EDIT` | `CONFLICT`, `COMPANY_PROFILE_NOT_FOUND`, … | 5 s |

`expectedVersion: null` creates the record and fails with `CONFLICT` if it already exists. A number must equal the stored `version`.

## REST (gateway, browser-facing, session cookie)

| Route | Request | Response | Permission |
|---|---|---|---|
| `GET /api/v1/company-profile/logo?v=<version>` | — | `200` bytes; `Content-Type` stored type; `Cache-Control: private, max-age=31536000, immutable`; `X-Content-Type-Options: nosniff`; `Content-Disposition: inline`; `404 COMPANY_LOGO_NOT_FOUND` | `company-profile:VIEW` |
| `PUT /api/v1/company-profile/logo?expectedVersion=<n>` | raw body, `Content-Type: image/jpeg \| image/png`, ≤ 10,485,760 bytes | `200 { profile: CompanyProfile }` | `company-profile:EDIT` |

REST errors use the gateway error body `{ error: { code, message } }` with status 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `PERMISSION_DENIED` / licence codes, 404, 409 `CONFLICT`, 413 `PAYLOAD_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, 503 `PARTNER_UNAVAILABLE`. The upload streams with a byte counter and stops at the limit (no unbounded buffering). Mutating REST calls also require the `Origin` header to match the app origin (CSRF guard; tRPC mutations already require POST + JSON).

## Internal REST (partner, gateway only, `x-service-token` + `x-actor-id`)

| Route | Body | Response |
|---|---|---|
| `GET /internal/v1/company-profile` | — | `{ profile: CompanyProfile \| null }` |
| `PUT /internal/v1/company-profile` | `CompanyProfileInput & { expectedVersion }` (JSON ≤ 256 kB, existing limit) | `{ profile }` |
| `GET /internal/v1/company-profile/logo` | — | bytes + `content-type`, `x-logo-version` |
| `PUT /internal/v1/company-profile/logo?expectedVersion=<n>` | raw bytes (route-specific `express.raw`, limit 10 MB) | `{ profile }` |
| `DELETE /internal/v1/company-profile/logo?expectedVersion=<n>` | — | `{ profile }` |
| `GET /internal/v1/company-profile/options` | — | the reference lists |

## Implementation notes (backend, 2026-10-16)

- CSRF for the REST logo PUT: implemented as **"Content-Type must be image/jpeg or image/png"** instead of an Origin comparison. Browsers cannot send these types cross-site without a CORS preflight and the gateway allows no CORS; this avoids adding a `FRONTEND_URL` variable to the gateway. Deviation from "Origin header" above, same protection.
- Logo GET answers `Cache-Control: private, max-age=31536000, immutable` only when `?v=` equals the current version, otherwise `private, no-cache`; plus `nosniff`, `inline`, `Content-Security-Policy: default-src 'none'; sandbox`.
- Partner checks the service token **before** the 10 MB raw parser on `/internal/v1/company-profile/logo`.
- Gateway: cookie → session/licence/authz resolution moved unchanged from `main.ts` to `src/request-context.ts` and shared by tRPC and the REST controller.

## Compatibility and limits

New operations only; vendor/customer contracts are unchanged. The Next `/api/v1` proxy gains nothing for this feature except that it already forwards GET/PUT. Request bodies: tRPC ≤ 1 MB (unchanged), partner JSON ≤ 256 kB (unchanged), logo ≤ 10 MB on the two logo routes only.
