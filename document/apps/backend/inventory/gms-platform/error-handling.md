# Error handling: inventory / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; [contract](api-contract.md)

| Scenario | HTTP / stable code | Public outcome | Retry/idempotency |
|---|---|---|---|
| Missing/invalid JWT or session | 401 `UNAUTHENTICATED` | Login/refresh once | Do not replay post automatically |
| Missing license/grant/location | 403 `FORBIDDEN` / `LICENSE_REQUIRED` | Denied/activation | No retry until authorization changes |
| Auth view/JWKS or DB unavailable | 503 `AUTHORIZATION_UNAVAILABLE` / `DEPENDENCY_UNAVAILABLE` | Temporary unavailable | Fail closed, bounded safe-read retry only |
| Invalid quantity, line count, decimal, SKU | 422 `VALIDATION_ERROR` | Field/line hint | Fix input |
| Duplicate SKU, version or changed-body idempotency key | 409 `CONFLICT` / `IDEMPOTENCY_CONFLICT` | Resolve/refetch | Same key/body may be queried/resubmitted safely |
| Insufficient stock | 409 `INSUFFICIENT_STOCK` with safe failed line indexes | No partial post | Whole transaction rollback; adjust draft |
| Missing item/location/lot/doc | 404 `NOT_FOUND` | Not found | No retry |
| Storage full/queue unavailable on later features | 507/503 `STORAGE_FULL` / `QUEUE_UNAVAILABLE` | No partial file/job claim | Reconcile idempotency before retry |

Return no stack traces, SQL, internal URL, token, secret or other user's data. Structured logs carry request ID, user ID, route, status/duration and safe document ID; log slow DB queries >200 ms without interpolated values. Post has no automatic network retry after an ambiguous commit. Per-request timeout and transaction statement timeout must be bounded and measured to meet p95 <=2 s for <=200 lines.
