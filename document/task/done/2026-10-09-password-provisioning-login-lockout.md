# Password provisioning and login lockout

## Scope

Implemented ADR-0010, ADR-0011, ADR-0012, and `document/diagram/login-flow.md` across the auth backend, gateway, and login/password forms. Related API, login, password-policy, testing, and cookie documents were reconciled.

## Delivered

- CRM user creation remains passwordless in its response. The auth service creates a cryptographically secure 12-character initial password, emails it, and removes the new account if credential delivery fails.
- Forgot-password responses remain generic and asynchronous. Generated credentials are emailed, and active sessions are revoked after a reset.
- Added atomic per-user failed-login counting, a one-minute lock after three consecutive failures, reset on successful sign-in, and persistent success/failure attempt records.
- Attempt history uses a keyed HMAC-SHA-256 email hash instead of raw email. Unknown and known emails follow the same failed-login count and lockout responses.
- Added login feedback for remaining attempts, lockout, and rate limits, including a visible countdown and disabled submit button while locked.
- Aligned user-set password policy to 4–64 characters without character-class requirements. System-generated passwords remain 12 characters.
- Aligned email validation and field validation timing with `document/apps/frontend/template/form-login-guildlines.md`.
- Gateway preserves HTTP methods and forwards auth cookies/origin and upstream `Set-Cookie`/`Retry-After` headers.
- Password updates use `PUT /api/v1/me/password`. The caller's current session is retained while other sessions are revoked.
- Forgot-password handles rate limits and upstream errors; rate-limited requests return HTTP 429.
- Auth and gateway request logs redact cookies, API keys, passwords, and password confirmation fields.
- The Docker development auth startup regenerates Prisma Client before migration deployment, avoiding stale generated code in its persistent volume after schema changes.
- Reconciled the API, login, password-policy, cookie-consent, login-flow, and test-case documents. Remaining privacy ownership details are listed in [`open-questions.md`](../../open-questions.md).

## Verification

- Prisma formatting and generation passed. Migration `20261009000000_login_attempt_lockout` applied successfully and the database schema was up to date.
- HTTP checks through the frontend proxy passed for valid login, wrong-password/unknown-account parity, three failures followed by HTTP 423 lockout, rejection while locked, successful login after expiry, and password change through the gateway while retaining the current session. The demo password was restored and test sessions were signed out.
- After regenerating Prisma Client in Docker, the Super Admin demo login returned HTTP 200 and sign-out returned HTTP 200.
- Login page screenshot was inspected against the supplied reference. Interactive browser checks were unavailable in this run; see [`document/testing/user-check/2026-10-09-auth-docs.md`](../../../document/testing/user-check/2026-10-09-auth-docs.md).
- Workspace `pnpm typecheck` and `pnpm build` passed for frontend, gateway, and auth service.

## API behavior

- Invalid credentials for an existing user return `401` with `attemptsRemaining`.
- The third consecutive invalid password returns `423` with `retryAfterSeconds: 60`.
- Attempts made while locked return `423` with the remaining lock duration.
- Unknown email follows the same `401` attempt count and `423` lockout sequence as an existing account, avoiding account-existence disclosure through login status.
- Password update returns `204`; the caller's session remains valid and other sessions are revoked.
