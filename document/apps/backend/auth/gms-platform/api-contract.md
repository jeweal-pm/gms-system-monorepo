# API contract: auth / GMS platform migration

- SA revision: 1, approved-design; see central TODO gates; consumers: frontend auth, master and inventory; TODO GP-AUTH-01..06
- Base: same-origin `/api/auth`; old `/api/auth` Next proxy remains only during migration

| Operation | Input and validation | Result | Rule / failure |
|---|---|---|---|
| Existing Better Auth username sign-in | Existing username/password contract, CSRF/origin, rate limit | Existing session cookie plus proposed `gms_access` 15-minute and `gms_refresh` 7-day cookies after eligibility | Reuse current generic credential error/lockout; no token if inactive/license denied |
| `POST /api/auth/refresh` | HttpOnly refresh cookie, CSRF/origin, no body | New rotated refresh and access cookies, `204` | One atomic consume; reuse/expired -> 401 and revoke family; DB outage -> 503; no automatic retry |
| Existing logout | Session/access/refresh cookies, CSRF/origin | Clear all relevant cookies, revoke family/session | Idempotent, no residual access after next-request view check |
| `GET /api/auth/jwks` | No identity, rate/size bound | Public JWK set `{keys:[...]}` with `kid`; cache policy <=10 min | No private key/material; unknown key not accepted by consumers |
| `POST /api/auth/trpc/<authProcedure>` | Existing typed procedure input; size cap and CSRF for mutation | Existing output shape, migrated one procedure at a time | Live exact permission check; 401/403/503 with shared envelope |
| Internal read-only `auth.current_authorization` view | Verified JWT `sid`/`sub` used as indexed filter by domain API | Current local account/session/grants/locations and last known license record | SELECT only; unavailable -> fail closed; remote license freshness needs the separate proposed check below |
| Proposed private `POST /internal/v1/license-current` | Service credential plus verified user/instance identity; bounded timeout | Fresh signed decision, or verified offline-fallback decision with `fallbackUntil` and no token bytes | 403 explicit revoked/expired; 503 if unavailable without eligible fallback; `LICENSE_OFFLINE_GRACE_DAYS` 0–2, default 2; design exception approved, endpoint security/concurrency and external service still gated |

JWT protected header/payload: `alg=EdDSA`, `kid`; `iss=<configured customer auth issuer>`, `aud=gms-domain-api`, `sub`, `sid`, `jti`, `iat`, `nbf`, `exp<=15m`. Exact configured issuer and clock skew become deployment contract; do not use `NEXT_PUBLIC_*`. Cookie names/Path/Domain require prototype against Better Auth 1.7.7 to prevent collision with its session cookie. JSON failures use `{error:{code,message,requestId}}` where tRPC can map its standard envelope consistently. No pagination on these auth endpoints; user-admin list remains bounded by existing contract. This is a proposed addition, not a claim that current auth serves these routes.

**SA revision 3 approved and staged:** no public API changed. The license service now accepts a user ID only and resolves the immutable subject from auth's database. A stale online response that loses the database order check returns 503 and never becomes eligible. Explicit denial remains 403/activation state. The future private endpoint must authenticate its service caller and verified user/session identity; exact credential transport and route activation remain a separate GP-AUTH-05 gate.
