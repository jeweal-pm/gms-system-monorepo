# INV-20261021-005 — Partner database test cleanup isolation

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor and security-auditor / scoped changed-code review / none
- Date and audit scope: 2026-10-21; new partner company-logo PostgreSQL integration fixture
- Source commit, dirty paths, and relevant content hashes: HEAD plus changed-file manifest SHA-256 `8a4270a8e35519c0cc979694211a9e4957daaa2e33086a8a1c1158c6626c566c`; `backend-api-partner/test/company-profile/company-profile.logo.db.integration.test.ts`
- Related ticket / root-cause fingerprint: `gms-test-fixture/partner-singleton-unscoped-cleanup`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-partner/test/company-profile/company-profile.logo.db.integration.test.ts:7-8,26-48`.
- Attacker prerequisites and reachable entry point: a developer or CI runner supplies a loopback PostgreSQL URL on a non-default port whose `f1_system` database is not disposable, then runs the partner test suite.
- Concrete trust boundary and source-to-sink trace: the guard checks only loopback, non-5432 port and database name. Setup inserts singleton `company_profile.id=1`; `afterAll` unconditionally deletes all `stored_files` rows with source `company-profile/1` and deletes profile ID 1. If setup fails because that profile already exists, cleanup can still delete pre-existing data and retained upload metadata.
- Observed impact and independent verification evidence: both auditors identified the cleanup scope statically. The recorded test run used the dedicated test-only container on port 55439 and created the row itself; no existing profile or upload was removed. No data loss was observed.
- Missing validation fact / capability (if any): the test fixture does not prove that future `PARTNER_TEST_DATABASE_URL` values point to a disposable database or that cleanup only removes rows created by this test.
- Sanitized evidence sufficient for owner review: scoped review against manifest SHA-256 `8a4270a8e35519c0cc979694211a9e4957daaa2e33086a8a1c1158c6626c566c`; both reviewers classify as hardening, not a confirmed vulnerability.
- Raw report/run links (local, ignored evidence may not exist on another checkout): none

## Proposed work

- Allowed code scope and assigned implementation role: backend; partner DB integration fixture only.
- Suggested remediation: make cleanup conditional on successful creation, scope metadata cleanup to object keys recorded by this test, and require a positive disposable-database marker/identity before mutating the database.
- SA design / contract / flow / dependency change needed: none expected.
- Acceptance criteria: the test aborts before writing unless it can prove a disposable DB; failed setup cannot delete a pre-existing profile or metadata; successful setup cleans only its own rows and temporary bytes; tests cover rejected unsafe target and safe cleanup.
- Safe verification plan and prerequisites: use only the dedicated test-only PostgreSQL container and temporary filesystem; never test this guard against dev/live databases.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: none; finding is staged for owner review.
- Approval date: none
- Separate approved SA bundle/revision, if required: GMS file-storage SA revision 3; no service contract or schema change proposed.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: owner selection required before remediation
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: pending user selection
- Changed files / implementation revision: none
- Checks performed, results, and limitations: static review only; recorded test run used the dedicated test-only database and passed
- Follow-up auditor and verification evidence: pending ticket selection
- Remaining risk or reopened validation gap: future misconfiguration of the partner test URL could target a non-disposable local database
- Completion report under document/task/done/: none
- Final status / date: pending-review
