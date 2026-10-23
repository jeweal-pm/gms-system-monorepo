# Frontend error handling: GMS platform migration

- UI revision: none; SA revision: 1; status: approved-design; see central TODO gates
- Related: [auth errors](../../backend/auth/gms-platform/error-handling.md), [master errors](../../backend/master/gms-platform/error-handling.md)

| API result | Frontend response |
|---|---|
| 401 unauthenticated/expired | Attempt at most one approved single-flight refresh for safe requests; otherwise show login. Do not replay an ambiguous mutation. |
| 403 license or grant denied | Show the existing activation/access-denied flow; never treat menu visibility as proof of access. |
| 503 `LICENSE_STATUS_UNAVAILABLE` | Show temporary unavailability, preserve unsent form data and a manual retry path. Do not claim the license is revoked. |
| 409 version/idempotency conflict | Retain user input and show the domain-specific conflict with a safe reload option. |
| 413/415 upload rejection | Explain size/type limits without retrying the whole upload automatically. |

The API owns the grace decision. If a safe response explicitly reports offline fallback, the UI may show a non-sensitive status; it must not compute a new deadline, expose signed tokens or promise access past the server's decision. Avoid retry loops during license-server outage and preserve the existing login UX until a separately approved UI revision changes it.
