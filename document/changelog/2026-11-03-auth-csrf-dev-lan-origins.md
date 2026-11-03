# 2026-11-03 Auth CSRF accepts the dev LAN origins

- Owner report 2026-11-03: as Super Admin on http://192.168.0.106 the User and Permission save failed with `CSRF_INVALID` (403); `/api/auth/refresh` also failed, so a LAN session ended after the 15-minute access token.
- Cause: the auth CSRF check (tRPC mutations, `/api/auth/refresh`, user photo upload) trusted only `FRONTEND_URL`, while Better Auth sign-in and api-master already trusted `AUTH_EXTRA_TRUSTED_ORIGINS` / `MASTER_TRUSTED_ORIGINS` (fed by `DEV_LAN_ORIGINS` in `docker-compose.gms.dev.yml`).
- Fix: `backend-api-auth/src/trpc/auth-trpc.csrf.ts` uses `trustedOriginsFor(FRONTEND_URL, AUTH_EXTRA_TRUSTED_ORIGINS)` (same set as sign-in); the `x-gms-csrf` marker and Sec-Fetch-Site rules are unchanged; a malformed `FRONTEND_URL` still trusts nothing. Production (no extra origins) trusts exactly `FRONTEND_URL` as before.
- Verification: `test/trpc/auth-trpc.csrf.test.ts` (+2 cases); auth suite 106 tests with DB, `tsc` 0. Live: sign-in / refresh / `userAdmin.update` 200/204/200 from `http://192.168.0.106` and `http://localhost:8080`; `http://localhost` (port 80, not configured) still 403 by design.
- Security review: sec-auditor clear, security-auditor clear (same revision as decimal-setup FE-DEC-106). Advisory: keep `AUTH_EXTRA_TRUSTED_ORIGINS` / `MASTER_TRUSTED_ORIGINS` unset or HTTPS-only in production.
