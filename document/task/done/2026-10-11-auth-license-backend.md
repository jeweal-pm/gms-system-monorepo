# Auth license backend implementation

- Feature / approved revision: `auth-license` / SA revision 2
- Central TODO: [auth-license](../todo/auth-license.md)
- Design bundle: [backend architecture](../../apps/backend/auth/license-integration/architecture.md)
- Approval evidence: Project owner approved revision 2 with `อนุมัติชุดนี้`; the decision fixes no license transfer, immutable licensed-account email, one active session per user, 3 failed activation attempts per minute, 7-day grace, configured issuer, audience `f1-system-customer-backend`, and `{error:{code,message}}`.

## Delivered

- Auth-owned remote/mock license clients, bounded response parsing, EdDSA key-ring verification, status resolution, 15-second bounded process cache and 7-day outage grace from token `fetchedAt`.
- License cache and activation lockout schema plus additive migration. CRM provisioning now checks an issued license before creating an account or sending credentials.
- Authenticated status/activation endpoints and gateway context. Protected application procedures require an allowed license state; status and activation remain available for restricted accounts.
- Activation locks after three invalid keys for one minute. Login cleanup leaves one session per user. Email change and license transfer remain unavailable; another email requires a new account and separately issued license.
- Added exact `jose@6.2.12`, environment configuration and Pino redaction for license keys. Local mock signing material is stored only in ignored `.env`.

## Verification

- Passed auth lint, typecheck and build.
- Passed gateway lint, typecheck and build.
- Passed Prisma schema validation, merged development Compose configuration validation, and `git diff --check`.
- Parsed local `LICENSE_MODE=mock` configuration successfully; the configured Ed25519 public/private keypair matched. Key material remained private in ignored `.env` and was not printed.
- Unit/integration tests and runtime database/container checks were not run. The migration was authored but not applied to a database.
- No new container, worker, or database pool was added. Status cache is capped at 4,096 entries; production latency and aggregate host capacity have not been measured.

## Handoff

Backend scope is complete. Frontend may create/select a central TODO for the license status and activation experience, using the API in the linked design bundle. The external license server remains out of scope and must implement the approved API contract before production remote mode can work.
