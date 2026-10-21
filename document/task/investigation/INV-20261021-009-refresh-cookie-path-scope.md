# INV-20261021-009 — Refresh cookie is sent beyond the refresh endpoint

## Tracking

- Ticket revision: 3
- Status: resolved
- Owner: backend
- Priority: user-authorized remediation
- Auditor / mode / run ID: sec-auditor / focused changed-code review; follow-up manifest below
- Date and audit scope: 2026-10-21; refresh cookie issuance, rotation, revocation
- Source commit, dirty paths, and relevant content hashes: final scoped review manifest `8483cbf46212b194f945e142084c8aa9f76a5009aaab9088ac0eb9d36470e6cf` (18 auth/master source and test paths)
- Related ticket / root-cause fingerprint: `gms-auth/access-cookie-refresh-path-reused-for-refresh-cookie`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/auth/access-token.ts:101-109`; `backend-api-auth/src/auth/refresh-http.ts:118-125`; ADR-0026 refresh-cookie scope.
- Attacker prerequisites and reachable entry point: same-origin browser requests after a user has signed in; no exploit was demonstrated.
- Concrete trust boundary and source-to-sink trace: first correction narrowed `gms_refresh` to `/api/auth/refresh`. Follow-up review found a shared `cookieOptions` helper also applies that path to `gms_access` when refresh rotates tokens. Browser requests to `/api/master/trpc` then omit the refreshed access JWT, and clearing `gms_access` at `/` will not clear the wrongly scoped cookie.
- Observed impact and independent verification evidence: the final source sets `gms_access` to `/` and `gms_refresh` to `/api/auth/refresh`; refresh rotation and logout clear each cookie at the matching path. HTTP tests assert both paths.
- Missing validation fact / capability (if any): none for the selected cookie-path scope. End-to-end browser refresh was not part of this ticket's focused verification.
- Sanitized evidence sufficient for owner review: `refresh-http.ts` passes each cookie's own path to issuance and clearing helpers; the scoped HTTP assertions cover rotation and logout.
- Raw report/run links (local, ignored evidence may not exist on another checkout): focused reviewer result in this conversation; no raw audit output.

## Proposed work

- Allowed code scope and assigned implementation role: backend auth cookie helpers and refresh/logout tests.
- Suggested remediation: keep `gms_access` at `/` and scope only `gms_refresh` to `/api/auth/refresh`; clear both cookies using matching paths.
- SA design / contract / flow / dependency change needed: none expected; ADR-0026 already specifies narrower scope.
- Acceptance criteria: the refresh cookie is only sent to its endpoint; the access cookie remains available to protected domain routes; rotation and logout clear each cookie using its matching path; focused HTTP tests verify each attribute.
- Safe verification plan and prerequisites: inspect Set-Cookie headers in unit/HTTP tests and verify through a local browser session.

## User selection and approval

- Approved ticket revision: 2
- Actual user instruction / approval evidence: user directly instructed that identified problems be fixed through completion and that code be delivered promptly; this selects the existing finding without a second approval question.
- Approval date: none
- Separate approved SA bundle/revision, if required: ADR-0026.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none; the selected cookie-path fix is resolved.
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none; targeted implementation and tests are in progress.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / follow-up review manifest `d8cf306d...` | Refresh helper applied refresh path to access cookie; clear path mismatched emitted access cookie | Separated access/refresh path options and matching clears; added HTTP assertions | Auth suite 83 passed / 14 skipped; typecheck passed; final source assertion review confirmed the distinct paths | Both roles' outcomes recorded against manifest `8483cbf...`; no DB-backed browser session run was available. |

- Assigned owner and start date: backend / 2026-10-21
- Changed files / implementation revision: auth login and refresh cookie issuance, rotation, clear helpers, and focused tests.
- Checks performed, results, and limitations: auth suite 83 passed / 14 skipped; auth typecheck passed; assertions cover login/refresh/logout path attributes. Database-backed browser refresh was not run.
- Follow-up auditor and verification evidence: `sec-auditor` reported source fix present; parent-applied `security-auditor` definition fallback independently confirmed it on the same scoped manifest `8483cbf46212b194f945e142084c8aa9f76a5009aaab9088ac0eb9d36470e6cf` (18 files).
- Remaining risk or reopened validation gap: no cookie-path issue remains; full browser/session integration remains part of the broader migration gate.
- Completion report under document/task/done/: none
- Final status / date: resolved / 2026-10-21
