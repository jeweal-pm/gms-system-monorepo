# INV-20261021-008 — Unauthenticated photo requests can buffer large bodies

## Tracking

- Ticket revision: 3
- Status: resolved
- Owner: backend
- Priority: user-authorized remediation
- Auditor / mode / run ID: sec-auditor / focused changed-code review; follow-up manifest below
- Date and audit scope: 2026-10-21; auth photo route middleware and Nginx ingress
- Source commit, dirty paths, and relevant content hashes: initial finding manifest `676f0b1368c1da3c8bb4dea6941ebb7fbb78a4f3e812914595b42473a29ed437`; final photo-route delta manifest `a25d5eb92714a9895df1dcb362c42888947e75dd28e0562f81403484f5adcf9d` (three scoped files)
- Related ticket / root-cause fingerprint: `gms-auth/photo-body-buffering-before-authorized-view-edit`; original unsupported-method path plus residual authorization-before-buffering gap, distinct from INV-20261021-002 (photo read integrity)
- Category: vulnerability
- Verdict: confirmed
- Vulnerability severity: medium (reviewer assessment; no load test performed)

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/main.ts:24-39,76-81`; `docker/nginx/gms-dev.conf:11,57-59`.
- Attacker prerequisites and reachable entry point: unauthenticated network client able to reach the photo URL through Nginx or the published auth port.
- Concrete trust boundary and source-to-sink trace: public and legacy photo routes reject unsupported methods and GET bodies, then check the current session, license, and VIEW/EDIT permission before `express.raw` can buffer a body.
- Observed impact and independent verification evidence: final focused review confirmed the legacy route uses the same access middleware before the parser; HTTP tests cover denied public and legacy requests; direct local auth runtime returned legacy GET-with-body 400, unsupported POST 405, and anonymous public GET 401.
- Missing validation fact / capability (if any): none for the selected buffering finding. No load or aggregate-concurrency claim is made.
- Sanitized evidence sufficient for owner review: all supported photo paths authorize before raw body parsing; denied paths do not reach the parser in the focused HTTP tests.
- Raw report/run links (local, ignored evidence may not exist on another checkout): focused reviewer result in this conversation; no raw audit output.

## Proposed work

- Allowed code scope and assigned implementation role: backend auth photo HTTP middleware and focused HTTP regression tests; infra may adjust only the selected Nginx route controls.
- Suggested remediation: authorize the active session, current license and exact VIEW/EDIT grant before any raw parser; reject GET bodies and unsupported methods before parsing. Keep the internal route's existing contract unchanged.
- SA design / contract / flow / dependency change needed: none expected; revisit if route methods or upload contract change.
- Acceptance criteria: unsupported methods and unauthorized/ineligible photo GET/PUT requests are rejected before body buffering; authorized photo flow remains functional; focused HTTP tests prove parser/controller are not reached on denial; both required security roles clear the same final changed source revision.
- Safe verification plan and prerequisites: use mocked/controlled HTTP tests first; any load check must use a disposable local service, bounded concurrency and measured 512 MiB auth limit, never production.

## User selection and approval

- Approved ticket revision: 2
- Actual user instruction / approval evidence: user directly instructed that identified problems be fixed through completion and that code be delivered promptly; this selects the existing finding without a second approval question.
- Approval date: none
- Separate approved SA bundle/revision, if required: existing approved auth route contract; none expected unless the contract changes.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 2
- Active pass: none; pass 2 resolved the finding.
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none; targeted implementation and tests are in progress.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / pre-fix manifest `676f0b...` | Unsupported HTTP methods still entered `express.raw` | Method rejection and session/CSRF-before-parser middleware; focused HTTP tests | Auth full suite 83 passed / 14 skipped; typecheck passed. Follow-up review confirmed anonymous unsupported-method path closed but found authorization still after parser. | Pass 2 must move exact permission/license denial before parser. |
| 2 | backend / review manifest `d8cf306d...` | Public-route access check fixed; legacy internal path still buffers before access checks | Added the same VIEW/EDIT/license check and GET-body guard to the legacy route before `express.raw` | Auth suite 83 passed / 14 skipped; typecheck passed; local runtime legacy GET-with-body=400, POST=405, anonymous public GET=401 | Both reviewers clear the changed three-file manifest below. |

- Assigned owner and start date: backend / 2026-10-21
- Changed files / implementation revision: `backend-api-auth/src/main.ts`, `backend-api-auth/src/user-admin/user-photo.http.ts`, and `backend-api-auth/test/user-admin/user-photo.http.integration.test.ts`.
- Checks performed, results, and limitations: targeted photo HTTP tests 4/4; auth suite 83 passed / 14 skipped; auth typecheck passed. Local runtime returned legacy GET-with-body=400, legacy POST=405, public anonymous GET=401. Fourteen database-dependent tests remain skipped because no isolated test database URL was configured; no load test was run.
- Follow-up auditor and verification evidence: `sec-auditor` clear and parent-applied `security-auditor` definition fallback clear on the same delta manifest `a25d5eb92714a9895df1dcb362c42888947e75dd28e0562f81403484f5adcf9d` (three files). The custom `security-auditor` agent type was unavailable; parent reviewed read-only under its definition.
- Remaining risk or reopened validation gap: no selected photo-buffering gap remains; performance/load behavior was not measured.
- Completion report under document/task/done/: none
- Final status / date: resolved / 2026-10-21
