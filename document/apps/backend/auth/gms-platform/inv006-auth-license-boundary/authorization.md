# Authorization: auth-owned current license decision

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Domain rules: [auth approved authorization](../authorization.md); [API contract](api-contract.md)

| Operation | Authentication | Required checks | Denial |
|---|---|---|---|
| Private current-license POST | Dedicated `MASTER_AUTH_SERVICE_TOKEN` from partner/master only | Constant-time token-digest compare; strict request schema; live `auth.current_authorization` match on both user and session IDs; active account; session expiry after database/current time; auth then resolves immutable `User.username` and applies current approved v2 license policy. | 401 service/context, 400 validation, 403 known license denial, 503 any unverifiable condition. |

Credential is separate from `PARTNER_SERVICE_TOKEN`; a token for existing gateway-to-partner calls must not authorize this route. The 32-byte random value is delivered from an out-of-repository file-backed Compose secret to auth and partner/master only; app config contains only `MASTER_AUTH_SERVICE_TOKEN_FILE`, and application code must read/digest the file without an env-value fallback. The bridge is defense-in-depth only: because auth is multihomed, every listener/interface requires the same application token. The credential is never sent by browser, Nginx or gateway and is never logged or stored in the database. Production secret provisioning/rotation remains a deployment prerequisite. The endpoint uses the existing `LicenseCurrentDecision` ordering and outage policy; it never returns its signed token. Local/mock tests can mint only development mock proof; `LICENSE_MODE=mock` remains forbidden in production. No real external license-server is implemented or claimed.
