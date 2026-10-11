# API contract: auth/gateway license integration

- Source UI revision / SA revision: none / `auth-license` revision 2
- Status: approved; SA revision 2 approved 2026-10-11
- Shared upstream contract: [license-server API](../../../../spec/0005-license-server-api.md)
- UI consumers: no approved frontend TODO yet; frontend integration is a later stage
- Diagrams: [sequence](sequence-diagram.md), [errors](error-handling.md)

All browser operations use the existing same-origin `/api/trpc` proxy. Internal gateway to
auth calls remain service-side HTTP and forward the session cookie. License key and raw JWT
are never returned to browser. Timestamps are RFC 3339 UTC instants.

| Operation | Caller | Input | Output | Permission | Errors / compatibility |
|---|---|---|---|---|---|
| `license.status` query | Browser via gateway | none | `{state, type?, expiresAt?, daysRemaining?, checkedAt?, retryAfter?}`; states `VALID, EXPIRING, EXPIRED, REVOKED, REQUIRED, GRACE, UNVERIFIABLE` | Authenticated own user; available even restricted | `UNAUTHORIZED`, `LICENSE_UNVERIFIABLE` (503 internal mapping); no token |
| `license.activate` mutation | Browser via gateway | `{licenseKey: string}` exactly 24 allowed chars/groups after normalization; no email/user ID | `{state: "VALID"|"EXPIRING", expiresAt}` | Authenticated own user; available while `REQUIRED` | 400 `INVALID_KEY`, 409 `ALREADY_ACTIVATED`, 429 after 3 failed attempts for 1 minute, 503 upstream unavailable |
| CRM `POST /api/v1/users` preflight | CRM via auth | Existing `{email,name,role}` plus CRM authentication | Create user only after verified upstream lookup; `pending` qualifies, `active` requires usable verified token | Instance API credential; license bound to normalized email + instance | 409 duplicate; 422 `LICENSE_REQUIRED`; 503 `LICENSE_UNVERIFIABLE`; no account or credential email on failure |
| Email change for licensed account | Not exposed by this revision | Licensed account email is immutable; a different email requires a new account and separately issued license | Keep Better Auth email change disabled; CRM create preflight applies to the new account | N/A | No rebind, transfer or key-migration API is proposed |
| Internal session/license context | Gateway only | Existing Cookie header; no user-supplied identity | `{session:{user:{id,email,name,role}}, license:{state,...}}` | Auth validates Better Auth session; private service network path | 401 invalid session; 503 unavailable; implemented `/internal/v1/session-context` |
| Internal activation | Gateway only | Session cookie and `{licenseKey}` | Same sanitized status result | Auth validates session and owns email binding | Same activation errors; implemented `/internal/v1/license/activate` |

Gateway does not call the upstream service. Auth's `LicenseClient` interface implements
`lookup(email)`, `activate(email,key)`, and `refresh(email)` using
[the upstream contract](../../../../spec/0005-license-server-api.md). `none`/`pending`
map to `REQUIRED`; active tokens are verified before storage. A valid signature must cover
configured issuer, approved audience `f1-system-customer-backend`, instance ID, normalized
subject, status, type, license expiry, `iat`, `exp`, and known `kid`. Owner approved issuer
from deployment configuration, audience `f1-system-customer-backend`, and error envelope
`{error:{code,message}}` for SA revision 2.
License transfer is explicitly out of scope and no rebind endpoint is proposed. A licensed
account's email cannot be changed; the user must create a new account with a separately
issued license.

For `status`, a fresh signed token is evaluated locally. During outage, a previously verified
active token may use the approved 7-day grace from `fetchedAt`; inactive tokens are denied.
One active session per user is permitted. Activation locks after three failed keys for one
minute. `license.list` is deferred and outside this feature revision.

## CRM and email-change safety

CRM preflight calls upstream lookup before generating/saving a local user or sending its
password email. `pending` is an issued license/key and qualifies; `active` qualifies only
when its token and status/expiry verify. `none`, expired/suspended/revoked, malformed reply,
or outage denies account creation. The existing unique-email constraint resolves races.

License transfer to a new email is not supported. Better Auth email change is denied for
licensed accounts. A user who needs a new email must create a new account and receive a
separately issued license through CRM preflight. Auth always fails closed if the signed token
subject differs from the current normalized account email; it must not rebind the license.
