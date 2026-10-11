# Verification plan: auth license integration

- Feature / SA revision: `auth-license` / 2
- Status: planned; not run
- Approved contract/schema: SA revision 2 approved 2026-10-11; verification plan approved, not run

Current manifests provide auth/gateway build, typecheck and lint; no test runner is installed.
Do not claim automated unit/integration tests until the owner approves a test runner or adds
dependency. Backend should first add focused tests using the repository's approved tooling,
or document deterministic manual contract checks if no runner is approved.

Proposed mock-only test emails (scenario behavior is disabled in remote mode):

| Email local part | Signed mock claims/result |
|---|---|
| `license-valid` | active paid, expires in 90 days |
| `license-expiring` | active paid, expires in 7 days |
| `license-expired` | active, license expiry in the past |
| `license-revoked` | revoked |
| `license-suspended` | suspended |
| `license-pending` | no activated token / pending |
| `license-outage` | simulate upstream timeout; use verified cache/grace rules |

Exact scenario days/names are test-fixture proposals, not production business rules. The
expiring fixture (7 days remaining) is independent from the 7-day outage grace. Trial length
remains external license-server policy.

| Case | Setup/action | Expected result | Verification |
|---|---|---|---|
| BE-LIC-001 / 005 signature validation | Valid EdDSA token, altered signature, unsupported alg, unknown kid, wrong issuer/audience/instance/subject, malformed timestamps | Only valid pinned-key token accepted; all others denied, never grace | Unit/contract test |
| BE-LIC-006 state machine | active, expiring, expired, suspended/revoked, none, pending | Matches accepted statuses and boundary instants in UTC | Unit test |
| BE-LIC-003 gateway policy | unauthenticated, licensed, required, expired, revoked, unverifiable, restricted allow-list | Protected procedure enforced server-side; status/activate/logout reachable | Gateway test |
| BE-LIC-004 activation | malformed key, invalid, success, already activated, 429, timeout | Key never stored/logged; retry/idempotency and stable errors match contract | Auth integration test |
| BE-LIC-006 resilience | remote transient error with fresh/stale/no cache | Coalesced requests, bounded timeout/retry, grace only for verified eligible cache | Auth integration test |
| BE-LIC-002 / 008 persistence and email immutability | cache upsert, user deletion, concurrent resolution, email-change attempt | one row/user; cascade; old subject never grants access; licensed email change rejected without changing user/license | Prisma/PostgreSQL + auth integration |
| BE-LIC-007 CRM preflight | pending / usable active / none / expired / invalid signature / timeout / duplicate race | pending and eligible active permit create; others create no user and send no credential | auth/upstream integration |
| BE-LIC-008 immutable licensed email | attempt Better Auth email change for licensed account; create separate user under newly issued license | reject without changing account email or license binding; new account must pass CRM preflight; no transfer/rebind request is sent | Auth integration |
| BE-LIC-009 single session | concurrent successful logins for one user | exactly one deterministic newest session remains; old cookie rejected | PostgreSQL concurrency integration |
| BE-LIC-004 activation lockout | concurrent wrong keys, 3rd-failure boundary, one-minute expiry, success | lock after threshold with no concurrency bypass; success resets attempts | atomic database integration |
| BE-LIC-010 / 011 startup/config/capacity | mock in production, missing remote config, bounded refresh and cached verification | fail startup; no fallback; measure latency/pool/memory and preserve host headroom | process/config + bounded measurement; no unsupported guarantee |

After revision-2 approval: run `pnpm --filter @gem-crm/backend-api-auth lint`, `typecheck`, `build`,
Prisma schema validation/migration checks; run equivalent gateway lint/typecheck/build;
run contract/integration checks and inspect Compose config only if shared environment
configuration changes are approved. Record actual commands/results and never assert the
spec's <5 ms request claim without measurement. Do not execute tests before approval.
