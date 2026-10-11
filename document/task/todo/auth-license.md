# Backend TODO: auth/gateway license integration

- feature-id: `auth-license`
- revision: 2
- source-ui-revision: none (backend-only request)
- status: done
- source: [ADR-0013](../../adr/0013-per-user-license-with-signed-token.md), [ADR-0014](../../adr/0014-mock-license-client.md), [license spec](../../spec/0006-license.md), [upstream contract](../../spec/0005-license-server-api.md)
- dependencies: [dependencies](../../apps/backend/auth/license-integration/dependencies.md)
- approved-revision: 2
- approved-by: Project owner
- approved-at: 2026-10-11T23:20:42+07:00
- approval-evidence: `อนุมัติชุดนี้`; QL2 correction: no license transfer, licensed email immutable, new email requires new account and separate license; revision-2 values approved (single session, config issuer, audience `f1-system-customer-backend`, error `{error:{code,message}}`)
- review-bundle: [architecture](../../apps/backend/auth/license-integration/architecture.md), [API](../../apps/backend/auth/license-integration/api-contract.md), [sequence](../../apps/backend/auth/license-integration/sequence-diagram.md), [database](../../apps/backend/auth/license-integration/database-diagram.md), [authorization](../../apps/backend/auth/license-integration/authorization.md), [errors](../../apps/backend/auth/license-integration/error-handling.md), [dependencies](../../apps/backend/auth/license-integration/dependencies.md), [testing](../../apps/backend/auth/license-integration/testing.md), [ADRs](../../adr/0013-per-user-license-with-signed-token.md)

| Done | ID | Task | Allowed service/integration files | Depends on / frontend IDs | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-LIC-001 | Implement auth-owned LicenseClient, strict upstream schema validation, EdDSA issuer/audience/instance/subject/key-ring verification | `backend-api-auth/src/license/**` | SA revision 2 approved | No algorithm/key confusion; no untrusted token reaches gateway | Auth typecheck/build and review |
| [x] | BE-LIC-002 | Add `auth.LicenseCache` and `LicenseActivationLockout` migrations | `backend-api-auth/prisma/**` (shared integration-owned; parent serializes) | Approved revision 2 | one cache/user; no license key; clean rollback | Prisma schema validation; additive migration review |
| [x] | BE-LIC-003 | Add auth session/license context and gateway licensed procedure for every role | Auth source plus gateway `src/trpc/**`; gateway `src/main.ts` integration-owned and parent serializes | Approved revision 2 | every protected procedure checks trusted state; status/activate/logout exempt | Auth/gateway typecheck/build |
| [x] | BE-LIC-004 | Add authenticated activation and per-user lock after 3 failures for 1 minute | Auth license module/controller; gateway contract | Approved API/error contract | no caller identity; no key persistence/logging; lockout atomic | Auth/gateway lint/typecheck/build; key fields redacted |
| [x] | BE-LIC-005 | Implement MockLicenseClient with development-only Ed25519 key and deterministic test cases | `backend-api-auth/src/license/**` plus out-of-repo local key config | ADR-0014 / SA revision 2 approved | process refuses mock in production; remote mode never falls back | Config parser accepted local Ed25519 pair (`keyCount=1`, matching public/private key); no service boot check |
| [x] | BE-LIC-006 | Implement status resolver, bounded refresh coalescing and approved 7-day grace | `backend-api-auth/src/license/**` | API contract approval | no upstream call per procedure; invalid signature never grace | Code review: 15-second bounded status cache, in-flight coalescing, grace from `fetchedAt` |
| [x] | BE-LIC-007 | Preflight CRM user creation against upstream license lookup | Auth user-creation path; shared integration files serialized by parent | API contract approval | `pending`/eligible `active` allow; `none`/invalid/outage creates no user or sends no credentials | Auth typecheck/build; no runtime provisioning performed |
| [x] | BE-LIC-008 | Enforce immutable email for licensed accounts; keep license transfer/rebind unsupported | Auth user/email path; DB/composition files parent-serialized | Approved revision 2 | email change is rejected without changing account or license; using another email requires new account and separately issued license; no upstream rebind call | Email change route/plugin absent; Better Auth email-change disabled |
| [x] | BE-LIC-009 | Enforce exactly one active session per user | Auth session lifecycle hooks and database operations | Approved revision 2 | concurrent sign-ins leave one session; previous session invalidated | Auth typecheck/build; runtime concurrency not exercised |
| [x] | BE-LIC-010 | Add sanitized logs/config checks and verification | Auth/gateway; shared env files parent-serialized | Approved issuer/audience/error contract | credentials/tokens never logged; configuration fails closed | Auth/gateway lint; config validation enforces modes, keys, issuer/audience; Pino redaction includes keys |
| [x] | BE-LIC-011 | Run approved lint/typecheck/build and schema checks, capture capacity evidence and return actual API contract to frontend | Auth/gateway; docs | implementation complete | actual commands/results recorded; no unsupported latency claim | Auth/gateway lint, typecheck, build; Prisma validate; Compose config validation; local mock key config parse; no tests/database/container runtime check |

## Revision history and owner decisions

| Revision | Evidence | Decision |
|---|---|---|
| 1 | 2026-10-11: `อนุมัติ พร้อมระบุคำตอบ blocker` | SA revision 1 approved; approval does not cover revision 2. |
| 2 | 2026-10-11: `อนุมัติชุดนี้`; QL2 corrected | Approved SA revision 2: no transfer; licensed email immutable; new email requires new account/separate license. All-users license, CRM preflight, deferred list, one session, 3 failures/1 minute, 7-day grace, issuer/audience/error decisions approved. |

## Remaining review blockers

Open product decisions outside this implementation scope: QL1 license after account deletion,
QL4 sales/payment issuance, and external trial duration. No license-server rebind endpoint is
required because licenses do not transfer between emails.

`license.list` is explicitly deferred and excluded from this feature revision.

## Approval and handoff

Revision 2 backend implementation is complete. Auth and gateway lint, typecheck and build
passed; Prisma schema and merged Compose configuration validate. No unit/integration tests or
runtime database/container checks were run. Host impact is bounded: no new process/container/
pool, at most 4,096 short-lived in-memory status entries, database cache limited to one row per
user, and remote calls time out at 3 seconds. Latency and production capacity have not been
measured; do not claim the <5 ms target without measurement. Frontend can consume the approved
contract in [API contract](../../apps/backend/auth/license-integration/api-contract.md) when a
frontend TODO is selected.
`LICENSE_MODE=mock` configuration parsing passed with one matching local Ed25519 key; private
key material remains only in ignored `.env` and was not printed.
