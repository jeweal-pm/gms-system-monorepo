# Error handling: master / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; [contract](api-contract.md)

| Scenario | Status / stable code | Public outcome | Retry and logging |
|---|---|---|---|
| Invalid JWT/session | 401 `UNAUTHENTICATED` | Login/refresh once | No mutation replay |
| No license/grant or inactive | 403 `FORBIDDEN` / `LICENSE_REQUIRED` | Existing access/activation UX | No retry until state change |
| Auth view/JWKS/DB unavailable | 503 `AUTHORIZATION_UNAVAILABLE` | Temporary unavailable | Fail closed; safe read only may retry once with deadline |
| Invalid input/search limit/MIME | 422 `VALIDATION_ERROR`; 413/415 for upload | Field-specific message | Fix input, no automatic retry |
| Duplicate code/version mismatch | 409 existing domain error | Resolve conflict, refetch | Transaction rolled back; same semantics as legacy |
| Missing record | 404 `NOT_FOUND` | Not found | No retry |
| Storage/DB failure | 503 `DEPENDENCY_UNAVAILABLE` | Temporary unavailable | Bounded retry only for idempotent read; preserve old object on failed logo write |

Keep current tRPC error shape until frontend compatibility mapping is approved, then include stable `error.code`, safe `message` and `requestId` in RPC metadata. Never reveal SQL, path, token, customer PII or stack. Timeouts: proposed <=3 s read/<=5 s write excluding approved bounded upload; record measured exceptions. Legacy path errors must be compared by user-visible outcome, not only HTTP code.
