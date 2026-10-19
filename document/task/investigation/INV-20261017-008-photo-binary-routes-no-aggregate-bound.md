# INV-20261017-008 — User photo upload/download has no total concurrency limit across buffered requests

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (gateway and auth)
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only, static) / no run ID
- Date and audit scope: 2026-10-17; user-permission user photo with file storage (user-photo.md PH-01…10, owner approval "อนุมัติ PH"). Covers the auth photo routes and storage, the gateway photo REST routes and `userAdmin.removePhoto`, and the frontend photo tile.
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree. Review hash c6dee7f33779f161: sha256 (first 16) of `git diff -- backend-api-auth/src backend-api-auth/prisma backend-api-gateway/src frontend/src/features/user-permission`, followed by photo-storage.ts, user-photo.controller.ts, photo.ts, photo-tile.tsx and migration.sql, in that order.
- Related ticket / root-cause fingerprint: `binary-image-routes:no-aggregate-buffer-bound`. Distinct from INV-20261017-003 (Argon2 CPU) and from INV-20261017-006 (unauthenticated parser on non-PUT methods). The existing company logo routes (`company-profile-logo.controller.ts`, 10 MB) follow the same pattern but are outside this review scope.
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-gateway/src/user-photo.controller.ts`:
    - L42-57: `readBody` buffers up to 5 MB, then calls `Buffer.concat`.
    - L94-98.
  - `backend-api-gateway/src/trpc/auth-client.ts`:
    - L60: `new Uint8Array(raw.data)` makes another full copy of the upload.
    - L98-140: `getAuthBinary` buffers up to 5 MB for each GET.
  - `backend-api-auth/src/main.ts` L46: `express.raw` buffers up to 5 MB for each PUT.
  - `backend-api-auth/src/user-admin/photo-storage.ts` L44-51: `readFile` loads the whole file for each GET.
- Attacker prerequisites and reachable entry point:
  - An authenticated, licensed user who holds `user-and-permission:EDIT` (for upload) or `:VIEW` (for download).
  - Entry point: `PUT|GET /api/v1/user-admin/users/:id/photo`.
- Concrete trust boundary and source-to-sink trace:
  - Each single request is bounded correctly: the Content-Length pre-check, the streaming cut-off, and the permission check all run before the body is read.
  - Nothing limits how many of these requests run at the same time, and these routes have no limiter.
  - Upload uses about 3× 5 MB of transient memory at the gateway (chunks, concat, Uint8Array copy) and about 1-2× at auth.
  - Download uses about 2× at the gateway and 1× at auth.
- Observed impact and independent verification evidence: static estimate only.
  - About 50 concurrent uploads could approach the gateway's 768 MiB memory limit.
  - A similar number of concurrent GETs of a 5 MB photo could pressure auth's 1 GiB limit.
  - This is not a privilege escalation, because the actor already holds the grant. It is a gap in keeping resources bounded within the 8 GB / 4 vCPU host budget.
- Missing validation fact / capability (if any): actual RSS per request, and whether a reverse proxy in front of the services applies connection or rate limits.
- Sanitized evidence sufficient for owner review: yes.
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: backend. Files: `backend-api-gateway/src/user-photo.controller.ts`, `backend-api-gateway/src/trpc/auth-client.ts`, `backend-api-auth/src/main.ts` or `backend-api-auth/src/user-admin/**`, and their tests.
- Suggested remediation:
  - Add a small in-process semaphore, for example 2-4 concurrent photo uploads and a small number of concurrent downloads per process. Requests over the cap get 429 or 503 with a stable domain code.
  - Remove the extra `Uint8Array` copy and pass the Buffer directly.
  - Optionally, stream the file at auth on GET.
  - Consider applying the same helper to the logo routes as a separately selected task.
- SA design / contract / flow / dependency change needed: SA review only if a new error code is added. No dependency is needed.
- Acceptance criteria:
  - Concurrent photo requests above the cap are rejected before any buffering.
  - Peak memory per request at the gateway is no more than about 2× the file size.
  - Tests cover the cap, and its release on error or abort.
- Safe verification plan and prerequisites: unit tests with fake streams. No load test against shared or live services.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint:
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
