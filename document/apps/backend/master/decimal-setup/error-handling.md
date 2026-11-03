# Service error handling: master / decimal-setup (SA revision 1, pending-review)

| Condition | Source | tRPC code / HTTP | `domainCode` | Frontend behavior |
|---|---|---|---|---|
| No session | `requireMasterSession` / `requireMasterGrant` | UNAUTHORIZED 401 | `UNAUTHENTICATED` | Existing sign-in redirect; provider keeps 2/2 |
| Authorization view or license check unavailable | same | SERVICE_UNAVAILABLE 503 | `AUTHORIZATION_UNAVAILABLE` | Provider keeps 2/2; Setup page shows `DetailLoadError` with Retry |
| License not eligible | same | FORBIDDEN 403 | `LICENSE_REQUIRED` | Existing licence handling; provider keeps 2/2 |
| Missing grant on save | `permitted("decimal-setup","EDIT",true)` | FORBIDDEN 403 | `PERMISSION_DENIED` | Error toast; stays in edit mode |
| CSRF missing/invalid on save | same | FORBIDDEN 403 | `CSRF_INVALID` | Error toast "Please reload the page" |
| Out-of-range / non-integer / extra key | zod strict | BAD_REQUEST 400 | `VALIDATION_ERROR` (+ `fieldErrors` `{path: "weightPlaces"\|"pricePlaces", code}`) | Not reachable through the selects; generic error toast |
| Version mismatch / parallel first create | service (`count 0`, P2002) | CONFLICT 409 | `DECIMAL_SETUP_CHANGED` | Banner: "Decimal setup was changed by someone else. Reload to see the latest." + Reload |
| DB connection / pool / timeout | `mapDecimalSetupError` (`isPrismaUnavailable`) | SERVICE_UNAVAILABLE 503 | `PARTNER_UNAVAILABLE` | get: provider keeps 2/2, page error + Retry; save: error toast, edit values kept |
| Seed row missing | service `get` | 200 | — | Returns defaults with `version: 0`; first save creates the row; warn log `decimal_setup.row_missing` |
| Anything else | `domainCall` | SERVICE_UNAVAILABLE 503 | `DEPENDENCY_UNAVAILABLE` | As 503 |

Rules: domain exceptions use `partnerException` like Document Setup; log `decimal_setup.db_unavailable` with operation and
Prisma code only (no input values beyond the two integers). Save is never retried automatically; get retries once.
