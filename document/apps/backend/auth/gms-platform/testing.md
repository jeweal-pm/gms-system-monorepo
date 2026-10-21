# Verification plan: auth / GMS platform migration

- SA revision: 1 plus license-contract revision 2 and ordering revision 3; status: approved scoped designs; see central TODO gates; source UI revision: none
- Test execution: **partial GP-AUTH-01/03 and staged GP-AUTH-05 service slices verified on 2026-10-20**; remaining rows and route cutover are open.

| Case | Target / acceptance | Unit and integration evidence to add |
|---|---|---|
| GP-AT-01 | Better Auth sign-in still enforces existing lockout, active account and valid license; password generic error | Auth sign-in module/unit and real DB/license mock integration |
| GP-AT-02 | Access JWT issuer/audience/alg/kid/exp bound; JWKS rotation and unknown key fail closed | Signing/verifier unit and cross-service integration |
| GP-AT-03 | Refresh atomic single use, concurrent tabs, replay family revocation, logout/password change | Transaction unit and PostgreSQL integration |
| GP-AT-04 | Permission/grant/session/account change denies next protected request; price masking; view failure denies | Auth view migration/query and master/inventory integration |
| GP-AT-05 | Reachable remote revocation denies next request; transient outage uses only still-valid signed eligibility within configured 0/1/2-day grace, without sliding; explicit denial and invalid signature never use fallback | V2 client/policy, isolated PostgreSQL and out-of-order concurrency tests pass for staged service; private domain authorization and external server/load remain cutover gates |
| GP-AT-06 | CSRF/origin rejects custom tRPC/REST/auth mutations; SSR Set-Cookie propagated | HTTP integration with browser cookie jar |
| GP-AT-07 | Backward compatible additive migration and rollback, DB16/18, 4 GB load | Migration CI and staging smoke/load evidence |

Every added or changed module, function and API needs unit and integration coverage. Record actual commands/results after implementation; if a data-connection problem persists after three diagnosed corrective passes, create one integration-blocker ticket. Then route final changed code through both sec-auditor and security-auditor against the same revision.

## Staged license-contract revision 2 evidence (2026-10-20)

The approved v2 customer client sends `X-License-Contract-Version: 2` on a single 1,500 ms attempt. The verifier requires a signed `contract_version: 2` and exactly three days between `iat` and `exp`. The separate `resolveCurrentStatus` method derives the subject from auth's user row, checks online on each invocation, and records the latest ordered decision in `LicenseCurrentDecision` with PostgreSQL `NOW()`. It uses database time for a fixed 0–2-day fallback (default 2) only on transient timeout/5xx. Existing `resolveStatus` and browser routes remain on v1 until a verified cutover.

| Changed target | Unit case | Integration/boundary case |
|---|---|---|
| License configuration and offline policy | GP-LIC-02 range/default, expiry and denial branches | GP-LIC-04 controlled persistence and GP-LIC-05 isolated PostgreSQL boundaries |
| HTTP/mock license client and v2 request | GP-LIC-03 mock token claims, 406/429 behavior | GP-LIC-03 local HTTP server checks v2 header and legacy no-header response, single attempt |
| License service and token verifier | GP-LIC-02 signed fallback predicates; GP-LIC-04 missing/disabled user, stale write and DB failure | GP-LIC-05 real PostgreSQL success/revoke/404/outage/DB deadline and out-of-order 404/revoke across two service instances; external-server integration remains future cutover work |
| License claims/client interface | GP-LIC-02 v2 claim and GP-LIC-03 response shape | GP-LIC-03/04 through HTTP and service boundaries |
| Prisma auth schema and SQL migration | GP-LIC-04 compare-and-set fail-closed branch | GP-LIC-05 migration 8/8, real one-row/user persistence, state constraint and sequence ordering |

- `pnpm --filter @gem-crm/backend-api-auth test -- test/license/license-current.test.ts test/license/license-current.service.test.ts`: 12/12 before the final DB-failure/one-day cases were added; those cases passed in the final full suite.
- On an isolated disposable PostgreSQL 18.6 container with no project volume, `prisma migrate deploy` applied **8/8** migrations including `20261020160000_license_current_decision_order`. `LICENSE_TEST_DATABASE_URL=<isolated localhost URL> pnpm --filter @gem-crm/backend-api-auth test -- test/license/license-current.db.integration.test.ts`: GP-LIC-05 **6/6** pass, including forced out-of-order active→404/revoke. The container was stopped and removed.
- First full run with two workers: 53 pass, one existing JWKS integration test timed out at Vitest's 5-second limit while the temporary DB ran; no license assertion failed. A resource-bounded rerun, `LICENSE_TEST_DATABASE_URL=<isolated localhost URL> pnpm --filter @gem-crm/backend-api-auth test -- --maxWorkers=1`, passed **54/54 across 8 files**. Without this explicit test URL, the isolated DB suite skips and no live database is contacted.
- `pnpm --filter @gem-crm/backend-api-auth typecheck`, `build`, `lint`, and `git diff --check`: pass.
- Source revision: HEAD `44d5eb9` plus SHA-256 `63ABA554AA9651CB673D41035429EFB094306CE08808778543312994A3A7A96C` of sorted changed license source/schema/migration/test path and file hashes.
- Isolated PostgreSQL sequential and out-of-order integration passed. Real external license-server contract/load checks did not run; owner directed that the server stay in a separate repository and mock remain for now. The private endpoint is not mounted. GP-AUTH-05 and protected-route cutover remain open. See the investigation records.
- Both custom reviewer agents returned a usage-limit error. The parent applied their scoped guidance sequentially as a fallback; no independent agent review is claimed. Initial v2 reviews returned `needs-validation` for concurrent ordering; final ADR-0028 reviews returned `clear` for the staged ordering code. Reports are under `document/reviews/sec-auditor/` and `document/reviews/security-auditor/`.

## SA revision 3 ordering verification — approved and implemented

Under [ADR-0028](../../../../adr/0028-gms-license-current-decision-order.md), unit and isolated PostgreSQL integration cover monotonic order allocation, active/404 and active/revoke replies completing out of order across two service instances, invalid proof/429 denial, stale-response fail-closed result, later valid reactivation, mismatched signed subject, no initial row, 0/1/2-day bounds and DB failure. Full auth suite/typecheck/build/lint passed. Focused sequential parent fallback reviews examined the same final source: [sec-auditor clear for staged ordering](../../../../reviews/sec-auditor/2026-10-20-gms-license-ordering-rev3.md) and [security-auditor clear for staged ordering](../../../../reviews/security-auditor/2026-10-20-gms-license-ordering-rev3.md). The private endpoint still needs authenticated caller and actual authorization integration before activation. Measure sequence/table/pool and remote mock latency under the 4 GB/2 vCPU budget; external server capacity is a later cutover gate.

## Partial JWT/JWKS evidence (2026-10-20)

The staged change adds an independent EdDSA signer and public JWKS endpoint to Better Auth's existing mount. It does **not** issue access cookies, alter sign-in/session hooks, rotate refresh credentials, change license checks or switch routes. JWT issuance and consumer checks are still open, so GP-AUTH-01/03 remain unchecked.

- `pnpm install --frozen-lockfile --offline` failed because a lockfile package was absent from the local store; `pnpm install --frozen-lockfile` completed without manifest/lockfile edits.
- The first `pnpm ... test` reported 30/30 but the new tests were outside Vitest's `test/**` include. That result covered old tests only. Tests moved to `test/auth/` and reran.
- The first full run was 33 pass / 1 fail: Better Auth's database rate limiter queried Prisma on public `/jwks` with no local database. The diagnosed correction set the documented `"/jwks": false` rule for this bounded static endpoint, leaving sign-in rate limits unchanged. The second full run passed **35/35 across 5 files**. Corrective ledger: initial staged implementation plus one diagnosed correction, 2 of 3 allowed passes; stop on success.
- `pnpm --filter @gem-crm/backend-api-auth typecheck` and `build` passed after Prisma Client generation. No live PostgreSQL sign-in, cookie, lockout or license test ran; no production parity is claimed.
- Final changed-code source manifest: `44d5eb9` plus SHA-256 `06BD3751A2113D5290E88F11044B6B51BF2559CA08D51218FC46A1F83454C553`. Focused sequential parent fallback reviews: [sec-auditor clear for this slice](../../../../reviews/sec-auditor/2026-10-20-gms-access-jwks-scope.md), [security-auditor clear for this slice](../../../../reviews/security-auditor/2026-10-20-gms-access-jwks-scope.md). Agent usage limits prevented independent reviewer agents; neither review covers future token issuance or consumer authorization.

## Refresh credential storage slice (2026-10-21)

- Added a hashed, single-use refresh credential/family store, RFC 9562 UUIDv7 IDs compatible with PostgreSQL 16, an auth-owned current-authorization view, migration, unit tests, and PostgreSQL integration tests. This is not connected to Better Auth routes or access-token issuance; GP-AUTH-01/02/04/06 remain open.
- `pnpm --filter @gem-crm/backend-api-auth prisma:migrate:deploy` in the local dev container applied migration 9/9 successfully. Existing database data was preserved.
- Focused tests reported by backend: unit **2/2**, isolated PostgreSQL integration **4/4**, full auth suite **54 passed / 6 skipped**; typecheck, build, lint, and `git diff --check` passed. The isolated database test uses a disposable PostgreSQL 18.6 container; no project volume was used or removed.
- Changed-source manifest is HEAD `d2ac3f3` plus SHA-256 `21c830e4f1c92567fccd049fdb9ddd090696f7a1d15cceea931efcd71493575a` over the scoped auth/master/config paths. Parent applied both reviewer instructions sequentially because custom review agents hit a usage limit; see [sec-auditor](../../../../reviews/sec-auditor/2026-10-21-gms-platform-slices.md) and [security-auditor](../../../../reviews/security-auditor/2026-10-21-gms-platform-slices.md). Their `clear` verdicts cover only the staged, unmounted source; no auth HTTP/session/license boundary is claimed verified.
