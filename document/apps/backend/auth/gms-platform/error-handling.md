# Error handling: auth / GMS platform migration

- SA revision: 1; status: approved-design; see central TODO gates; [API](api-contract.md)

| Scenario | HTTP / code | Public outcome | Retry / logging |
|---|---|---|---|
| Invalid credentials, locked login | 401 `INVALID_CREDENTIALS` or existing lockout contract | Generic login message, no account enumeration | No automatic retry; request ID only |
| No/expired/invalid access or refresh | 401 `UNAUTHENTICATED` | Reauthenticate or perform one safe refresh | Do not log token; client single-flight refresh |
| Inactive, no license, no grant | 403 `FORBIDDEN` / `LICENSE_REQUIRED` | Existing activation/status flow or access denied | Not retryable until state changes |
| CSRF/origin absent or wrong | 403 `CSRF_REJECTED` | Request rejected | Log request ID and route, no cookie/header value |
| Refresh reuse/parallel loser | 401 `REFRESH_REUSED` | Clear family and reauthenticate | Security event with user ID only; no automatic replay |
| Auth DB/view unavailable | 503 `AUTHORIZATION_UNAVAILABLE` | Temporary unavailable; deny operation | Bounded one transport retry for safe GET only, never refresh/mutation |
| License-server transient timeout/5xx | Eligible fallback only until min(last successful check + configured grace, signed expiry); otherwise 503 `LICENSE_STATUS_UNAVAILABLE` | Allow bounded offline access or deny, per configured policy | Default 2 days; 0 denies immediately; fallback never slides; log fallback mode without token bytes |
| License-server explicitly revoked/expired, invalid signature or key/config error | 403 `LICENSE_REQUIRED` for explicit denial; 503 for indeterminate verification failure | Deny even within grace | Never treat a verified denial or cryptographic failure as an outage fallback |
| Unknown signing key/JWKS outage | 401 invalid key or 503 key service unavailable | Fail closed | Throttled key refresh, no permissive fallback |

Shared JSON envelope proposal `{error:{code,message,requestId}}`; tRPC transports retain their required RPC error envelope but expose matching stable code and request ID via a formatter. Map existing frontend error handling before cutover. No passwords, session cookies, raw JWTs, license key or PII in logs.

**SA revision 3 approved and staged:** a stale positive response losing the monotonic database compare-and-set returns 503 `LICENSE_UNVERIFIABLE` and is never cached or allowed. An explicit 404/revoked/expired, invalid proof or upstream 4xx/429 persists a `DENIED` marker before responding; a later outage never reuses the earlier positive proof. Database sequence/write/read failure returns 503. Do not log signed token bytes, external credentials or the subject.
