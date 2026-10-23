# Data fetching: GMS platform migration

- UI revision: none; SA revision: 1; status: approved-design; see central TODO gates
- TODO: [GP-FE-01..04](../../../task/todo/gms-platform-migration.md)

| Consumer | Current | Proposed after backend approval | Bound |
|---|---|---|---|
| Browser auth | Next `/api/auth/*` proxy | Same-origin Nginx `/api/auth/*` to auth | Credentials/cookies; CSRF on mutations; no token in JavaScript storage |
| Browser master data | Next `/api/trpc/*` to gateway | Domain typed tRPC `/api/master/trpc/*` | Existing input/output parity, page size <=200, no unbounded batch |
| Browser inventory | No approved UI | `/api/inventory/v1/*` only for a separately approved feature | No speculative client or page in this revision |
| Next SSR | Current app routes/proxies | Private `INTERNAL_API_URL_AUTH` and `INTERNAL_API_URL_MASTER` | Per-user credential forwarding, timeout, no shared cache, propagate refresh cookies |
| Small UI composition | Existing Next route handlers | `/bff/*` only where an approved page needs server composition | Bounded fan-out; no permanent API gateway behavior |

Use stable request IDs and map tRPC error data to existing form/page UX. Treat 401 as a single safe refresh attempt or reauthentication, 403 as an actual denial/activation state, and 503 `LICENSE_STATUS_UNAVAILABLE` as a temporary status; do not endlessly retry. Mutations must carry idempotency/version data required by the domain contract. Keep old clients available during a measured feature-by-feature cutover, then remove only after caller inventory shows zero use and rollback is ready.
