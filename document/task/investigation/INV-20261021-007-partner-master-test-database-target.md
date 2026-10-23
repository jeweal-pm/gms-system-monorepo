# INV-20261021-007 — Master authorization integration test may use the wrong database

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: backend
- Priority: selected for remediation
- Auditor / mode / run ID: sec-auditor + security-auditor / focused changed-code review / INV-007-r1-final
- Date and audit scope: 2026-10-21; master current-authorization PostgreSQL integration fixture
- Source commit, dirty paths, and relevant content hashes: HEAD plus changed fixture SHA-256 `9f6b4248e2034a2038988b75fe61b0236a81e80411cb54cc113b13059377a4af`; verification record in `document/apps/backend/master/gms-platform/testing.md`
- Related ticket / root-cause fingerprint: `gms-test-fixture/master-partner-url-guard-not-used-by-client`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-partner/test/master/auth-context.db.integration.test.ts:5-8,17-25`; `backend-api-partner/src/database/prisma-client.ts`; `backend-api-partner/src/config.ts:26-27`.
- Attacker prerequisites and reachable entry point: a developer/CI runner supplies the guarded `PARTNER_TEST_DATABASE_URL` and runs the DB integration test while `PARTNER_DATABASE_URL` is unset or points elsewhere.
- Concrete trust boundary and source-to-sink trace: the test's `canRun` guard validates `PARTNER_TEST_DATABASE_URL`, but setup only stubs `DATABASE_URL` to `AUTH_TEST_DATABASE_URL`. The partner Prisma client obtains its connection through `loadDatabaseUrl()`, which reads `PARTNER_DATABASE_URL` or falls back to localhost:5432 outside production. Therefore the partner-side view query may run against a different DB from the guarded test URL.
- Observed impact and independent verification evidence: confirmed statically by the focused security-auditor. The DB test was skipped because dedicated test URLs were absent; no test connection or data impact was observed.
- Missing validation fact / capability: prove the integration fixture uses the exact validated partner URL and refuses unsafe/default DB targets before importing the Prisma client.
- Sanitized evidence sufficient for owner review: reviewer traced the test guard and actual partner Prisma config; this is a fixture isolation finding, not a claim of production vulnerability or data loss.
- Raw report/run links (local, ignored evidence may not exist on another checkout): reviewer evidence recorded in the master verification document.

## Proposed work

- Allowed code scope and assigned implementation role: `backend-api-partner/test/master/auth-context.db.integration.test.ts` and its verification documentation; backend owner.
- Suggested remediation: set the partner client's URL from the validated `PARTNER_TEST_DATABASE_URL` before module import; add a test asserting missing/mismatched safe URL prevents DB access.
- SA design / contract / flow / dependency change needed: none expected if this remains a test-fixture isolation correction.
- Acceptance criteria: the partner Prisma client connects only to the validated dedicated test URL; unset or mismatched test URLs fail before connection; integration passes on a disposable DB without touching port 5432.
- Safe verification plan and prerequisites: use a disposable PostgreSQL container on a dedicated non-5432 loopback port; verify target host/database without printing credentials; confirm no connection to the developer DB.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: user replied "แก้เลย" after parent asked whether to authorize backend fixes for INV-20261021-006 revision 1 and INV-20261021-007 revision 1.
- Approval date: 2026-10-21
- Separate approved SA bundle/revision, if required: none expected for a test fixture-only correction.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: `INV-20261021-007-r1` / `gms-test-fixture/master-partner-url-guard-not-used-by-client`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none — pass 1 completed; all ticket acceptance criteria were verified on a disposable non-5432 loopback PostgreSQL target.
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none; use disposable PostgreSQL on a dedicated non-5432 loopback port and never developer DB/production.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / selected ticket r1; source SHA-256 `9f6b4248e2034a2038988b75fe61b0236a81e80411cb54cc113b13059377a4af` | Guard checked a different variable than the partner Prisma client reads; an unset test URL could fall back to localhost:5432 | Added fail-closed explicit target parsing for both service URLs; required same loopback database/port; set `PARTNER_DATABASE_URL` from the validated test URL before Prisma import | Targeted: **5 passed** including U1 missing URL, U2 unsafe/malformed/default port, U3 mismatched target, U4 override-before-import, and I1 real auth Prisma writes plus partner view reads/revocation/inactive-user denial on disposable PostgreSQL 18.6 at `127.0.0.1:55439`; no project volumes. Full partner: **297 passed / 17 skipped** (22 files). Typecheck, lint, build passed with `NODE_OPTIONS=--max-old-space-size=1024`. No credential output. | Acceptance met; ticket resolved. Parent must refresh scoped security reviews for this changed test source before overall backend handoff. |

- Assigned owner and start date: backend / 2026-10-21
- Changed files / implementation revision: `backend-api-partner/test/master/auth-context.db.integration.test.ts`; `document/apps/backend/master/gms-platform/testing.md`; ticket evidence. The test URL parser rejects unsafe/missing/mismatched targets without logging values and pins both service URLs before importing the Prisma clients.
- Checks performed, results, and limitations: focused DB test **5 passed** on an ephemeral no-volume container at loopback port 55439; full partner suite **297 passed / 17 skipped**; typecheck, lint, build passed. The full suite skips unrelated DB-gated files because test URLs were unset; the selected master DB integration itself ran with restricted roles and passed.
- Follow-up auditor and verification evidence: both scoped read-only reviewers returned `clear` for the exact fixture source SHA-256 `9f6b4248e2034a2038988b75fe61b0236a81e80411cb54cc113b13059377a4af`. Both verified target parsing and actual partner Prisma URL wiring. Their recorded limitation is that the no-volume/disposable property relies on the run report, which neither reviewer independently reran. This does not reopen the passed ticket acceptance checks.
- Remaining risk or reopened validation gap: none for the selected test-target isolation criterion. Master API route remains unmounted for the separate INV-20261021-006 and GP-MASTER-01/02 gates.
- Completion report under document/task/done/: [INV-20261021-007 revision 1](../done/2026-10-21-inv-20261021-007-partner-test-target.md)
- Final status / date: resolved / 2026-10-21
