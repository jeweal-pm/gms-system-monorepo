# INV-20261021-010 — GMS auth/master boundaries lack current-revision runtime evidence

## Tracking

- Ticket revision: 3
- Status: needs-validation
- Owner: backend
- Priority: user-authorized validation/fix
- Auditor / mode / run ID: sec-auditor + security-auditor / earlier focused review; follow-up source/runtime evidence below
- Date and audit scope: 2026-10-21; current auth-view role, direct Nginx routes and master logo HTTP path
- Source commit, dirty paths, and relevant content hashes: focused final source manifest `8483cbf46212b194f945e142084c8aa9f76a5009aaab9088ac0eb9d36470e6cf` (18 auth/master source and test paths)
- Related ticket / root-cause fingerprint: `gms-platform/current-auth-master-runtime-boundary-unverified`; related earlier INV-20261021-006 (resolved for an older source/runtime revision)
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/main.ts`; `backend-api-master/src/main.ts`; `backend-api-master/src/master/authz-database.ts`; `backend-api-master/src/company-profile/company-logo.public.controller.ts`; `backend-api-master/src/internal-auth/service-token.guard.ts`; current-revision DB/runtime tests.
- Attacker prerequisites and reachable entry point: no confirmed bypass; this is a required security-boundary validation gap before route cutover.
- Concrete trust boundary and source-to-sink trace: auth-owned current authorization and Nginx-to-auth/master routes protect direct tRPC and logo endpoints. The logo controller has `@PublicRoute()` but checks the JWT, current grants, license and CSRF via the master auth context before returning or parsing protected content; the route middleware applies authorization before the raw parser.
- Observed impact and independent verification evidence: the Nest integration test mounts the real `APP_GUARD` and logo controller, denying anonymous access (401) and permitting a mocked current VIEW grant without a service token (200). Local runtime returns Nginx health/login/auth session=200, legacy photo GET-with-body=400 and POST=405, anonymous public photo/logo GET=401, and `/internal/*`=404. No bypass was confirmed.
- Missing validation fact / capability (if any): DB-backed auth-view/grant behavior and the actual view-only DB role are not proven because database integration tests were skipped; an authenticated current license/grant runtime flow and production ingress are also not verified.
- Sanitized evidence sufficient for owner review: focused final source manifest `8483cbf46212b194f945e142084c8aa9f76a5009aaab9088ac0eb9d36470e6cf`; local route behavior above; auth 83 passed/14 skipped and master 317 passed/19 skipped; both role reviews returned `needs-validation` solely for remaining DB/production evidence.
- Raw report/run links (local, ignored evidence may not exist on another checkout): focused reviewer results in this conversation; see also [INV-20261021-006](INV-20261021-006-gms-master-auth-boundary-validation.md).

## Proposed work

- Allowed code scope and assigned implementation role: backend auth/master HTTP and database integration verification. Do not change service/API contracts or schema under this ticket without separate SA approval.
- Suggested remediation: keep the selected local runtime and add one focused Nest integration test for the actual global guard/public logo path; preserve database-view integration as a separate validation prerequisite.
- SA design / contract / flow / dependency change needed: none anticipated for test-only validation; required if remediation changes route contract or service trust boundary.
- Acceptance criteria: DB role is view-only and reads the approved auth view; all direct auth/master routes behave as specified through Nginx; logo route works for a licensed/granted user and denies unauthorized callers; both scoped reviews agree on exact final code hash.
- Safe verification plan and prerequisites: use disposable loopback PostgreSQL and a local isolated Compose project with project volumes preserved; no production or remote deployment.

## User selection and approval

- Approved ticket revision: 2
- Actual user instruction / approval evidence: user directly instructed the parent to complete fixes and not stop at documents or repeated approvals; this selects the current local boundary validation/fix scope.
- Approval date: none
- Separate approved SA bundle/revision, if required: approved GMS auth/master architecture and ADR-0031; any changed contract needs separate approval.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: 1; backend selected-fixes agent is adding the real Nest global-guard integration test.
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: the Nest global-guard integration test is implemented and passed; isolated DB credentials/fixture and a production ingress environment are unavailable in this local-runtime task.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: backend / 2026-10-21
- Changed files / implementation revision: `backend-api-master/src/company-profile/company-logo.public.controller.ts`, `backend-api-master/src/company-profile/company-logo.http.ts`, and `backend-api-master/test/company-profile/company-logo.guard.http.integration.test.ts` include the tested public logo guard path.
- Checks performed, results, and limitations: auth 83 passed / 14 skipped and master 317 passed / 19 skipped; both package typechecks passed. Local runtime routes and health passed as recorded above. DB-dependent tests remain skipped without isolated `*_TEST_DATABASE_URL` values.
- Follow-up auditor and verification evidence: `sec-auditor` and parent-applied `security-auditor` definition fallback inspected the same manifest `8483cbf46212b194f945e142084c8aa9f76a5009aaab9088ac0eb9d36470e6cf`; both returned `needs-validation` for DB-backed auth-view/grant and production-ingress evidence, not a confirmed bypass.
- Remaining risk or reopened validation gap: database-view and production profile evidence remain open; keep this item `needs-validation` and do not recirculate the same source for review.
- Completion report under document/task/done/: none
- Final status / date: needs-validation
