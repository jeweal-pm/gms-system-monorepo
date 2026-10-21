# Error handling: mounted master authorization boundary

| Condition | Master public status/domain code | Domain call? | Retry |
|---|---|---|---|
| JWT absent/invalid or current session invalid | 401 `UNAUTHENTICATED` / `AUTHORIZATION_CONTEXT_INVALID` | No | Safe refresh per existing frontend once; never mutation replay |
| Mutation CSRF invalid | 403 `CSRF_INVALID` | No; reject in context creation | No |
| Explicit license denial or missing grant | 403 stable `LICENSE_*` / `PERMISSION_DENIED` | No | No |
| Auth view unavailable, private endpoint unauthorized, timeout, malformed response or license indeterminate | 503 `AUTHORIZATION_UNAVAILABLE` | No | No automatic retry |
| Valid preconditions then domain validation/conflict/dependency error | Existing mapped tRPC error | Yes only after validation/authorization pipeline | Current safe behavior only |

Private endpoint detail is translated to safe master codes; never forward auth upstream body, tokens or stack. Responses are `private, no-store`. Correlate by request ID without logging cookie, service bearer, license token, username or customer PII.
