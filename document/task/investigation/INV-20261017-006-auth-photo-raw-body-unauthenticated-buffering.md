# INV-20261017-006 — Auth photo route buffers up to 5 MB for unauthenticated non-PUT requests

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused changed-code review (guidance mode, security-review.md) / no full-audit run
- Date and audit scope: 2026-10-17; user-photo file storage (user-photo.md PH-01…10), auth raw-body route and its session pre-check
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree; review hash c6dee7f33779f161 (sha256 first 16 of `git diff -- backend-api-auth/src backend-api-auth/prisma backend-api-gateway/src frontend/src/features/user-permission` followed by photo-storage.ts, user-photo.controller.ts, photo.ts, photo-tile.tsx, migration.sql)
- Related ticket / root-cause fingerprint: auth-main-photo-raw-parser-method-scoped-precheck; related INV-20261017-007 (auth port 3101 published on the host, infra)
- Category: vulnerability
- Verdict: confirmed (static trace; not exercised against a live service)
- Vulnerability severity: low (availability; requires network reach to auth port 3101)

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/main.ts` lines 15-25 (`photoSessionCheck`, line 16 `if (request.method !== "PUT") return next();`) and line 46 (`expressApp.use(PHOTO_ROUTE, photoSessionCheck, express.raw({ type: [...PHOTO_TYPES], limit: PHOTO_MAX_BYTES }), photoBodyErrors)`).
- Attacker prerequisites and reachable entry point: no session. Network access to auth port 3101 (published on the host in `docker-compose.yml` line 61, see INV-20261017-007; otherwise any Compose-network peer). The infra ticket INV-20261017-004 (auth runs as root) and bundle backend-api-auth/1 note this port but do not remediate it. Any method other than PUT (GET, POST, DELETE, PATCH) to `/internal/v1/user-admin/users/<any>/photo` (or a deeper path, since `use` matches by prefix) with `Content-Type: image/png` or `image/jpeg` and a body.
- Concrete trust boundary and source-to-sink trace: network client -> auth Express -> `photoSessionCheck` skips the session check for non-PUT -> `express.raw` (body-parser parses any method that has a body and a matching type; it does not filter by method) reads and buffers up to 5,242,880 bytes -> only then does Nest route the request (404 for POST/PATCH, 401 from `requireAccess` for GET/DELETE). Chunked bodies are buffered up to the limit before the 413.
- Observed impact and independent verification evidence: the comment at line 14 states the pre-check exists to reject "an upload without a session before buffering up to 5 MB"; the method guard makes that control bypassable. The rest of auth accepts at most 32 kB unauthenticated (`express.json({ limit: "32kb" })`), so this is about a 160x increase in unauthenticated per-request memory on a container capped at 1 GB / 0.5 CPU (PH-05). Roughly 200 concurrent requests reach the cap, which risks an auth OOM restart and a login/session outage for every service. No test covers main.ts middleware ordering or methods. The dev-stack live checks cover only PUT.
- Missing validation fact / capability (if any): whether port 3101 is reachable from outside the host in production (deployment fact, INV-20261017-007). Not exercised dynamically: this review used no live endpoints, by policy.
- Sanitized evidence sufficient for owner review: the code lines quoted above; no payload is needed.
- Raw report/run links: none (focused review, no run tree).

## Proposed work

- Allowed code scope and assigned implementation role: backend; `backend-api-auth/src/main.ts`, plus a new test under `backend-api-auth/test/`.
- Suggested remediation: run the raw parser for PUT only, and keep the session pre-check in front of it. For example, mount a method-checking wrapper so that non-PUT requests skip `express.raw`, or drop the `method !== "PUT"` short-circuit so every method that carries a body is session-checked first. Optionally, match the exact route (no deeper paths).
- SA design / contract / flow / dependency change needed: none. This brings the code into line with PH-04/05 as approved.
- Acceptance criteria: unauthenticated GET/POST/DELETE/PATCH with an image content type and a large body are rejected or ignored without buffering more than a small bound. An authenticated PUT still accepts up to 5 MB, and a larger one still returns 413 PHOTO_TOO_LARGE. Existing photo tests pass.
- Safe verification plan and prerequisites: add a supertest/integration test against the bootstrapped Express middleware stack (no live service) that asserts the body is not consumed for a non-PUT method without a session. Run the auth test suite.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: auth-main-photo-raw-parser-method-scoped-precheck
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
