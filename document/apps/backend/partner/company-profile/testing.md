# Backend tests: company-profile (SA 2, approved)

Follow the existing partner/gateway test setup (see the vendor [testing](../vendor/testing.md) results for commands). Cases:

| ID | Layer | Case | Expected |
|---|---|---|---|
| BT-CP-01 | partner | GET with no row | `{ profile: null }` |
| BT-CP-02 | partner | first save (`expectedVersion: null`) | row id 1, version 1, `updated_by` = actor |
| BT-CP-03 | partner | second first-save | 409 `CONFLICT` |
| BT-CP-04 | partner | update with stale version | 409; row unchanged |
| BT-CP-05 | partner | unknown country/currency | 400 with field paths |
| BT-CP-06 | partner | rich text with `<script>`-like text, unknown node type, `javascript:` link, depth 9, 2,001 nodes, 5,001 chars | 400 for each except plain text, which is stored as text |
| BT-CP-07 | partner | logo PNG 1 KB, JPEG 10 MB exactly | 200; version +1; sha256 stored |
| BT-CP-08 | partner | logo 10 MB + 1, GIF bytes with `image/png` type, PNG bytes with `image/jpeg` type | 413 / 415 / 415 |
| BT-CP-09 | partner | logo before first save | 404 `COMPANY_PROFILE_NOT_FOUND` |
| BT-CP-10 | partner | remove logo; GET logo | version +1; 404 |
| BT-CP-11 | partner | missing/wrong service token | 401 |
| BT-CP-12 | gateway | VIEW only: get ok; save/logo PUT/remove | 403 `PERMISSION_DENIED` |
| BT-CP-13 | gateway | logo PUT without/with foreign `Origin` | 403 |
| BT-CP-14 | gateway | logo GET headers | `Cache-Control` immutable, `nosniff`, stored type |
| BT-CP-15 | gateway | partner stopped | `PARTNER_UNAVAILABLE` |
| BT-CP-16 | migration | apply on the current dev DB; CHECKs reject id 2 and size mismatch | ok / errors |

Checks: `pnpm --filter @gem-crm/backend-api-partner typecheck`, `… lint`, `… build`, gateway the same; `db:migrate` in the dev container.

## Results — 2026-10-16 (parent, branch `feat/14-10-26-vendor`, local Docker dev stack)

| Check | Result |
|---|---|
| `pnpm --filter @gem-crm/backend-api-partner typecheck` / `lint` | pass / pass |
| `pnpm --filter @gem-crm/backend-api-gateway typecheck` / `lint` | pass / pass |
| Migration `20261016050000_company_profile` | applied on container start ("All migrations have been successfully applied"); 6 routes mapped |
| BT-CP-01…11 (partner internal, run from inside the gateway container with its own token; 23 checks) | **all pass**: null before save; logo before save 404; first save v1; duplicate first save 409; stale 409; unknown country/currency 400 with paths; rich text rejects unknown node, `javascript:` link, depth 9, 2,001 nodes, 5,001 chars; script-like text stored as plain text; empty doc → null; PNG upload; JPEG exactly 10,485,760 bytes overwrites; GET serves the new bytes; 10 MB + 1 → 413; GIF-as-PNG, PNG-as-JPEG, image/gif → 415; no token 401; wrong token on logo PUT 401 before buffering; remove → v+1; GET after removal 404 |
| Storage folder after the run | empty (no temp files); file lived only in volume `f1-system_partner-storage`; nothing under `backend-api-partner/storage/` in git |
| BT-CP-12…15 (gateway session/permission/headers) | partially: unauthenticated tRPC get → 401, REST GET/PUT → 401 (direct and through the Next `/api/v1` proxy). Permission (VIEW-only user), cache headers and partner-down not run (no test session credentials) |
| BT-CP-16 CHECK rejection | not run separately (CHECKs present in the migration) |
| Builds | not run (agent environment cannot run Turbopack/Nest builds reliably) |
| Test data | the test row was deleted afterwards |

Incident during the run: after the partner container was recreated it used the new `PARTNER_SERVICE_TOKEN` from the owner's re-created `.env`, while the gateway (only restarted) still had the old one, so every gateway→partner call returned 401. Fixed by recreating the gateway (`up -d --no-deps backend-api-gateway`); afterwards all cases passed.
