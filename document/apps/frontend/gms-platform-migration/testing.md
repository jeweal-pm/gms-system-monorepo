# Frontend verification plan: GMS platform migration

- UI revision: none; SA revision: 1; status: approved-design; see central TODO gates; execution: not run (design only)
- Follow [automated testing](../../../workflow/automated-testing.md) and [security review](../../../workflow/security-review.md) when implementation is approved.

| Case | Acceptance | Planned evidence |
|---|---|---|
| GP-FT-01 | Login, activation and logout retain current visible behavior after Nginx routing | Page/component unit and real-browser integration with cookie jar |
| GP-FT-02 | Migrated master procedures preserve result/error shapes and bounded lists | Typed client unit and API integration per feature |
| GP-FT-03 | SSR forwards user credential and refresh `Set-Cookie` without cross-user cache leak | Server route unit and two-user integration |
| GP-FT-04 | Concurrent refresh is single-flight; 401/403/503 mapping has no redirect loop or mutation replay | Client state unit and browser/integration cases |
| GP-FT-05 | Online revoked license denies, transient outage UI follows API decision for grace 0/default 2 days | Browser and API integration after remote contract exists |
| GP-FT-06 | Old proxy route can be restored during observation window; target route is same-origin | Staging cutover/rollback and request-log evidence |

Every changed page, component, module and function receives current unit/integration coverage before handoff. Route final code once to both required security roles on the same source revision and record both results in the existing verification document. Do not re-review approved design documents or resend unchanged code. Manual tester runs for changed journeys when required by its skill. This planning document does not claim unrun checks.

## Local Nginx preview browser check (2026-10-21)

- Manual browser check at `http://localhost:8080`: the demo Super Admin login completed and reached the GMS home page; opening Vendor displayed the existing vendor list and create form; the account menu showed the signed-in identity and Sign out returned to the login form. No vendor data was created or saved.
- The same preview returned HTTP 200 for `/login`, `/api/auth/get-session`, and existing `/api/trpc/system.health`; Nginx health returned 200 and `/internal/v1/customers` returned 404.
- This validates the local ingress preview and retained visible flow only. It does not verify target JWT/refresh cookies, frontend typed-client migration, master tRPC mount, production TLS, or production capacity. See the [manual tester report](../../../testing/user-check/2026-10-21-gms-local-auth-ingress.md).

## Direct auth/master transport verification and security review (2026-10-21)

- Current frontend checks: `pnpm --filter frontend exec vitest run test/lib/domain-trpc-fetch.test.ts --maxWorkers=1` passed **3/3**; full frontend suite passed **359/359 across 32 files**; frontend typecheck passed.
- Current backend checks previously run in this worktree: auth **79 passed / 14 skipped**, master **312 passed / 19 skipped**, both package typechecks/builds passed. Database-backed cases were skipped because no approved disposable DB URL was available for this run. Merged Compose syntax passed; no runtime cutover check was performed.
- Both focused reviewers inspected the same changed-code/config manifest SHA-256 `676f0b1368c1da3c8bb4dea6941ebb7fbb78a4f3e812914595b42473a29ed437` (146 scoped paths). `sec-auditor`: **blocked**, confirmed medium unauthenticated resource exhaustion because unsupported methods reach the photo raw-body parser without PUT-only auth checks. `security-auditor`: **needs-validation**; it identified the upload resource candidate but did not safely test impact. The differing verdicts are preserved; the affected code handoff remains blocked.
- Additional evidence: refresh cookie uses `Path=/` despite ADR-0026's narrower scope; staged as advisory [INV-20261021-009](../../../task/investigation/INV-20261021-009-refresh-cookie-path-scope.md). Current auth-view DB role/runtime routing and effective production ingress are unverified in [INV-20261021-010](../../../task/investigation/INV-20261021-010-gms-current-boundary-runtime-validation.md) and [INV-20261021-011](../../../task/investigation/INV-20261021-011-gms-effective-ingress-profile-validation.md). Reviewers disagreed on whether the browser-facing logo route passes the global service-token guard; verify by focused HTTP test under INV-010.
- At the time of the initial review, the photo finding and route checks were still staged; the user later directed immediate remediation. The current fixes/runtime result are recorded in the central migration TODO and auth verification record.

## Current local GMS runtime (2026-10-21)

- The stopped `f1-system-backend-api-gateway-1` orphan is absent after Compose reconciliation. Local GMS services are frontend, auth, api-master, PostgreSQL and Nginx. Nginx routes directly to auth/master tRPC; there is no gateway container or service in the active Compose profile.
- Runtime checks through `http://localhost:8080`: login 200, auth session 200, Nginx health 200, unsupported photo POST 405 before body parsing, anonymous photo/logo reads 401, and legacy `/internal/*` 404.
- This confirms local development ingress only. Production GMS profile, feature parity, capacity and deployment remain open.
