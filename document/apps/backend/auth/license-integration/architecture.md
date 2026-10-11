# Auth and gateway license integration — SA review bundle

- feature-id: `auth-license`
- revision: 2
- source-ui-revision: none (backend-only request)
- status: approved
- source: [ADR-0013](../../../../adr/0013-per-user-license-with-signed-token.md), [ADR-0014](../../../../adr/0014-mock-license-client.md), [license spec](../../../../spec/0006-license.md), [license-server API](../../../../spec/0005-license-server-api.md)
- approved-revision: 2
- approved-by: Project owner
- approved-at: 2026-10-11T23:20:42+07:00
- approval-evidence: `อนุมัติชุดนี้`; QL2 correction: licensed email immutable, no license transfer, new email requires new account and separate license.
- review-bundle: this file and all sibling documents, both linked ADRs, and the linked shared API contract

## Current implementation and boundary

The checkout has `backend-api-auth` (Better Auth, Prisma 7, PostgreSQL schema `auth`) and
`backend-api-gateway` (NestJS HTTP + tRPC). It has no license server. This implementation adds
auth-owned license cache/lockout tables and a pinned direct `jose` dependency. Gateway calls auth
`/api/auth/get-session` once while constructing each tRPC context. Browser code uses the
same-origin Next proxy. This revision assigns remote/mock client, token validation and
cache to auth; gateway receives a bounded license context from auth and enforces it on
protected procedures. Browser never calls auth internals or the license server directly.

No container/service is added. Existing auth and gateway images remain. Compose passes the
license mode and credentials as environment configuration; private mock signing material stays
out of the repository. Auth makes outbound
HTTPS requests only in `LICENSE_MODE=remote`; no server-to-server endpoint is implemented
by this feature. Existing `docker-compose.dev.yml` sets auth `NODE_ENV=development`; base
Compose sets production, so mock mode must fail startup there as required.

## Proposed behavior

- Auth resolves current session, selects a per-user cached compact signed token, and refreshes
  on first use or when its signed `exp` requires it. A single in-flight lookup per user is
  coalesced in-process; database upsert is keyed by user ID. Apply bounded remote timeout
  and at most one retry only for transient failure, with jitter/backoff bounded by the
  request budget. Never retry invalid key, invalid signature, malformed responses, or 4xx
  business errors.
- Auth validates fixed algorithm `EdDSA`, known `kid`, signature, configured instance,
  subject against the current normalized account email, claim types and timestamps. Never
  accept key material or algorithm choice from the token. Unknown/malformed/invalid tokens
  fail closed; do not turn signature failure into outage grace.
- Gateway's context carries the status verdict from auth. Every user, including Super Admin,
  must have a license; no role bypass exists. Licensed procedures reject `REQUIRED`,
  `EXPIRED`, `REVOKED`, and `UNVERIFIABLE`. Status, activate and logout
  remain reachable while restricted. UI redirects are out of scope; `license.list` is deferred.
- CRM user creation first calls authenticated upstream lookup by normalized email. `pending`
  means an issued license/key exists and permits account creation so the user can activate;
  `active` permits creation only after signature, subject, instance, status and expiry checks.
  `none`, inactive/expired, malformed response, or upstream outage fails closed: do not create
  the user or send credentials. A concurrent duplicate still relies on the local unique-email
  constraint; a losing create returns the existing conflict and leaves the remote license.
- License is never transferred to a new email, and licensed account emails are immutable.
  To use another email, create a new account and issue a separate license (one email per
  license). No license-server rebind API or transfer saga is part of this design. Always
  compare token subject with the current normalized account email and fail closed on
  mismatch; never accept the old-email token for a new address.
- On successful login, retain exactly one active session per user; serialize cleanup in the
  auth database and invalidate the other sessions. Activation failures are counted per local
  user; after 3 failed keys, lock activation for 1 minute. Do not persist or log keys.
- `LICENSE_MODE=mock` is allowed only outside `NODE_ENV=production`; it uses a local private
  Ed25519 development key supplied out-of-band and a matching public key. It must never
  silently fall back from remote to mock. `LICENSE_MODE=remote` uses only the configured
  HTTPS license API and per-instance credential.

## Schema, migrations and rollback

Auth owns `auth.LicenseCache`: one row per user, FK to `auth.User` with cascade, compact
token, `fetchedAt`, and nullable `lastErrorAt`. Add `auth.LicenseActivationLockout` for
atomic per-user failure count and `lockedUntil`; do not reuse password lockout. No key,
email-transfer record, or raw upstream error is stored. Token subject is always matched to
the current normalized email. Migration is additive; deploy schema before code; no existing
rows need backfill.

## Dependencies and rollout

Use `jose` for JWT verification/signing instead of handwritten JWT parsing. The approved exact
direct dependency `jose@6.2.12` is installed in `backend-api-auth`. Dev signing key remains
outside the repository. No new service/container or database is added; the existing PostgreSQL
pool is reused. Compose passes required settings to auth and requires valid remote configuration
in production, while the development override selects mock mode.

Roll out additive migration, auth implementation, then gateway context/guard. Start in mock
mode only in local/development; production startup requires remote mode and all required
issuer/audience/key/instance/API credentials. Remote integration remains disabled until
the external service contract and credentials exist. Rollback by restoring prior auth and
gateway images while keeping the additive cache table.

## Capacity and known limits

No new process, worker, or container. Auth uses a 15-second in-memory status cache capped at
4,096 users plus in-flight lookup coalescing; license tokens remain in the database, at most
one row per local user. Exact user count is not supplied. Gateway retains the existing auth
HTTP request per tRPC context; auth makes upstream calls only on first resolution or refresh,
never on every protected procedure. The HTTP client makes at most one jittered retry, with a
1.4-second per-attempt timeout and less than 3 seconds overall; the login latency budget needs
measurement. Do not claim the spec's <5 ms guarantee until measured. No new DB
pool is created. Host remains 8 GB RAM / 4 vCPU; verify existing container aggregate and
request concurrency during implementation.

## Scope

Backend only: auth cache/client/verifier, gateway context/guards, activation/status, CRM
license preflight, single-session enforcement, activation lockout,
migrations, configuration validation and verification. Frontend pages, redirect
behavior, banner, UX text, admin UI and browser tests are explicitly out of scope; no UI TODO
exists. License-server implementation/sales tooling/payment are out of scope.

## Bundle and unresolved decisions

Read [API contract](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md),
[database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md),
[verification plan](testing.md), and the [central TODO](../../../../task/todo/auth-license.md). Owner resolved QL2 (no license transfer),
QL3 and QL5 for revision 2: licensed account emails are immutable; create a new account and
issue a separate license for a new email. QL6 is interpreted as one active session per user
plus an activation lock after
3 failed attempts for 1 minute. The owner approved deployment-configured issuer,
`f1-system-customer-backend` audience, and `{error:{code,message}}` envelope for revision 2.
QL1/QL4 and trial duration stay in external product scope.
`license.list` is deferred and out of this feature.

## Approval required

Revision 1 approval is historical. Owner approved this exact revision-2 bundle on
2026-10-11 with `อนุมัติชุดนี้`, including the no-transfer/immutable-email correction and
JWT issuer, audience and error contract. Implementation may proceed against the central TODO.
