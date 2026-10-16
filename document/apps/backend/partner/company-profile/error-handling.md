# Errors: company-profile (SA 1, pending-review)

## Domain codes

| Code | tRPC code / HTTP | When | Frontend behaviour ([UI error handling](../../../frontend/company-profile/error-handling.md)) |
|---|---|---|---|
| `VALIDATION_ERROR` | BAD_REQUEST / 400 | Zod failure; `fieldErrors: [{path, code}]` with form paths (`bankDetails`, `phone.e164`, …) | errors by field; focus first |
| `CONFLICT` | CONFLICT / 409 | `expectedVersion` mismatch, or first save when a profile exists | reload dialog |
| `COMPANY_PROFILE_NOT_FOUND` | NOT_FOUND / 404 | logo upload/remove before the first save | save fields first (normal flow prevents it) |
| `COMPANY_LOGO_NOT_FOUND` | 404 | logo GET with no logo | empty tile |
| `PAYLOAD_TOO_LARGE` | 413 | logo > 10 MB; JSON > limits | "The image must be 10 MB or smaller" |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | content type not JPEG/PNG, or signature mismatch | "Choose a JPEG or PNG image" |
| `PERMISSION_DENIED` | FORBIDDEN / 403 | missing VIEW/EDIT | denied panel / read-only + toast |
| `UNAUTHORIZED`, licence codes | existing | session or licence | existing handling |
| `PARTNER_UNAVAILABLE` | SERVICE_UNAVAILABLE / 503 | partner down, timeout, token mismatch | load error + Retry / save toast, data kept |

## Rules

- Messages are generic; no stack traces, SQL or values in responses or logs.
- Partner maps Prisma unique/serialization errors to `CONFLICT`; anything else to the existing internal error (500 → gateway `PARTNER_UNAVAILABLE`).
- The logo PUT stops reading at 10 MB + 1 byte and replies 413 without forwarding.
