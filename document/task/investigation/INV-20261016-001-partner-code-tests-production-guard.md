# INV-20261016-001 — ADR-0021 integration/live tests lack a production guard and ship in service images

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (test guard); infra/devops overlap for image contents (`.dockerignore`), parent-serialized
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only) / none
- Date and audit scope: 2026-10-16; ADR-0021 changes (partner `code` required, `nextCode`, migration
  `20261016090000_partner_code_required`, gateway schemas/`describeError`/router, partner/customer/vendor frontend)
- Source commit, dirty paths, and relevant content hashes: branch `feat/16-10-26-fix-design-add-runingnumber`,
  HEAD `974134c` + uncommitted working tree. Reviewed backend set = the 17 paths from
  `git status --short -uall -- backend-api-partner backend-api-gateway`; sha256 of the sorted per-file sha256 list
  = `87b94f89b8d8d24b` (first 16 hex). Backend + `frontend/src/features/{partner,customer,vendor}` (30 paths) =
  `cf22cb98f572a23d`. The handoff hash `7bf1dae7582b00c6` ("15 files") could not be reproduced; see validation gaps.
- Related ticket / root-cause fingerprint: none / `partner-code-tests:no-env-guard+image-includes-test`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-partner/test/partner-code.integration.test.mjs:14-17` — target is `PARTNER_TEST_URL` (default
    `http://localhost:3201`) and `PARTNER_SERVICE_TOKEN` from the environment; `:12` imports the service's own
    Prisma client (whatever `DATABASE_URL` the process has). Creates and then deletes `BT21` rows (`:41`).
  - `backend-api-gateway/test/partner-code.live.test.mjs:10-13` — `GATEWAY_TEST_URL` / `AUTH_SERVICE_URL` from the
    environment; credentials fall back to the development seed Super Admin (same literal as
    `backend-api-auth/src/scripts/seed.ts:6`, not a new secret). Creates and deletes `BT21GW` rows.
  - `backend-api-partner/Dockerfile:12`, `backend-api-gateway/Dockerfile:10` (`COPY . .`) with root `.dockerignore`
    not excluding `**/test` — the test files are present in the built images, beside `dist/`, with
    `NODE_ENV=production` (`backend-api-partner/Dockerfile:16`).
- Attacker prerequisites and reachable entry point: none for an external attacker. Requires an operator (or CI job)
  with `docker exec`/shell access to a production container, or a misconfigured env pointing a test run at
  production. Not network-reachable; not an exploit.
- Concrete trust boundary and source-to-sink trace: operator shell -> `node --test test/partner-code.*.test.mjs` in a
  production partner container -> default `PARTNER_TEST_URL=localhost:3201` resolves to the production service, and
  the container already holds `PARTNER_SERVICE_TOKEN`/`DATABASE_URL` -> test `POST`/`PATCH`/`DELETE` writes on
  production `partner.customer`/`partner.vendor` (test rows only, removed in `after`; a crash between create and
  `after` leaves them, and their `C…/V…` codes advance the production running number).
- Observed impact and independent verification evidence: static reading only; no test was run and no container was
  contacted. Neither file checks `NODE_ENV`, a host allowlist or an explicit opt-in flag. The documented commands
  (`document/apps/backend/partner/customer/testing.md`, "Revision 2") say "never run it against production", but
  this is only a convention.
- Missing validation fact / capability (if any): whether the production deploy uses these Dockerfiles unchanged
  (no `.dockerignore` exclusion elsewhere), and whether the production auth seed creates the demo Super Admin
  (out of scope here; pre-existing).
- Sanitized evidence sufficient for owner review: yes (above). No secret values are recorded.
- Raw report/run links: none.
- Independent corroboration (sec-auditor, focused pre-handoff guidance mode, read-only, 2026-10-16): same
  source revision independently recomputed — backend 17 paths `87b94f89b8d8d24b`, backend + frontend 30 paths
  `cf22cb98f572a23d`. Same root cause, so no separate ticket was created. Confirmed by static reading: no
  `NODE_ENV`/opt-in/host guard in either write-capable file, and `.dockerignore` does not exclude `**/test`. The seed
  fallback is not a new secret, and `backend-api-auth/src/scripts/seed.ts:13` refuses to seed outside
  `NODE_ENV=development`. The unit files (`backend-api-gateway/test/partner-code.test.mjs`,
  `backend-api-partner/test/partner-code.unit.test.mjs`) use only an in-process stub and are not affected.
  This remains hardening (not-applicable verdict, no severity).

## Proposed work

- Allowed code scope and assigned implementation role: backend — `backend-api-partner/test/partner-code.integration.test.mjs`,
  `backend-api-gateway/test/partner-code.live.test.mjs`; parent/infra/devops — root `.dockerignore` (shared file,
  parent-serialized).
- Suggested remediation:
  1. In both write-capable test files, fail fast unless an explicit opt-in is set (for example
     `ALLOW_LIVE_DB_TESTS=1`) and `NODE_ENV !== "production"`; optionally restrict target hosts to the dev Compose
     names/localhost.
  2. Remove the seed-credential fallback in the live test (require `LIVE_TEST_USERNAME`/`LIVE_TEST_PASSWORD`), or
     keep it only behind the same dev opt-in.
  3. Exclude `**/test` (and other non-runtime files) from the service images via `.dockerignore`, if the dev Compose
     stack does not rely on the image copy (it bind-mounts the source; verify before changing).
- SA design / contract / flow / dependency change needed: no (test and build-context hygiene only; `.dockerignore`
  goes through infra/devops ownership).
- Acceptance criteria: running either test with `NODE_ENV=production` or without the opt-in exits before any HTTP
  call or DB access; dev runs with the opt-in still pass; built images contain no `test/` directory.
- Safe verification plan and prerequisites: run the tests in the dev containers with/without the flag; inspect the
  image file list (`docker run --rm <image> ls /app/backend-api-partner`) on a locally built image only.

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
