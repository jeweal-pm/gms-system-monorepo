# Error handling: auth-owned current license decision

| Condition | HTTP / code | Caller action | Logging |
|---|---|---|---|
| Missing, wrong, malformed service bearer | 401 `SERVICE_UNAUTHENTICATED` | Stop; no retry | Request ID, route and outcome only |
| Invalid body/extra property/oversize | 400 `VALIDATION_ERROR` | Stop; implementation defect or malformed caller | No body values |
| User/session no longer current, inactive, mismatched or expired | 401 `AUTHORIZATION_CONTEXT_INVALID` | Stop domain request; no retry | Request ID only; no token/session credential |
| Explicit required/expired/revoked license | 403 stable `LICENSE_*` | Deny current request; activation UX can use existing flow | Decision category; no subject/token |
| License upstream outage with eligible policy fallback | 200 `GRACE` with fixed `fallbackUntil` | Continue this request only; no cache and no retry | Fallback mode/deadline only |
| Upstream outage without eligible fallback, invalid proof, DB/view unavailable, stale CAS, timeout | 503 `LICENSE_UNVERIFIABLE` | Deny; no automatic retry/replay | Dependency category and request ID |

Auth endpoint overall deadline 1,900 ms; partner deadline 2,000 ms; no retry, no response cache. The caller maps 403 to denied, 401 to unauthenticated/current-context invalid, and 503/transport timeout to authorization unavailable. Do not expose upstream messages, token data, usernames, SQL, or stack traces.
