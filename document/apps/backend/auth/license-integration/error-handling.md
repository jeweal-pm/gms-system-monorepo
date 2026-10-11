# Error handling: auth/gateway license integration

- Feature / SA revision: `auth-license` / 2
- Status: approved; SA revision 2 approved 2026-10-11

| Scenario | Domain result | Public contract | Retry | Logging |
|---|---|---|---|---|
| No license / upstream `none` or `pending` | `LICENSE_REQUIRED` | 403 | no | user ID, state only |
| License expiry reached | `LICENSE_EXPIRED` | 403 | no | state, no token |
| Signed status suspended/revoked | `LICENSE_REVOKED` | 403 | no | state, no token |
| Remote unavailable, verified active cache within approved grace | `GRACE` | request allowed; status query reports grace | do not retry after bounded attempt | warning + metrics; never include token/email/key |
| Remote unavailable, no valid cache or grace exhausted | `LICENSE_UNVERIFIABLE` | 503 | one bounded retry for transient failures only | sanitized upstream category |
| Invalid signature, unknown `kid`, wrong instance/subject, malformed claims | `LICENSE_UNVERIFIABLE` | 503; no token detail and never grace-eligible | no | security event; no JWT/key/body |
| Invalid activation key | `INVALID_KEY` | 400 | no | count attempt only, never key |
| Already activated with valid token | success with cached status | 200 | no repeat mutation required | outcome only |
| Activation throttled | `TOO_MANY_ATTEMPTS` | 429 + retry delay | wait for policy window | user ID / keyed hash, no key |
| CRM lookup returns `none` or ineligible token | `LICENSE_REQUIRED` | 422 from CRM create-user | no account, password or email is created | state only |
| CRM lookup finds issued `pending` license | eligible | 201 after user commit | no | result category only |
| CRM lookup unavailable/malformed | `LICENSE_UNVERIFIABLE` | 503; do not create user | no | sanitized category only |
| Email change requested for licensed account | No email-change route is enabled | Reject; account email and license binding remain unchanged. User must create a new account and obtain a separately issued license | no retry | user ID and result code only; no email/key/token |
| Session replaced by newer login | `UNAUTHORIZED` | 401 | user signs in again | no session token |
| Upstream 5xx/timeout | transient unavailable | 503 or grace | max one retry within bounded deadline | request correlation and status class |
| Bad upstream schema/4xx unknown code | protocol failure | 503 | no | schema/code category only |
| Invalid/missing required config or mock in production | startup failure | no service start | no | config names only, never values |

Never expose the license server's message, signature failure details, API key, token,
activation key, cookie, or signing material. Existing Pino redact paths must be reviewed
for new license request fields. Public gateway maps stable domain codes; tRPC error codes
and HTTP mapping require contract tests. Signature failures are not treated as outages or
grace-eligible. See approved behavior in the [central TODO](../../../../task/todo/auth-license.md).
