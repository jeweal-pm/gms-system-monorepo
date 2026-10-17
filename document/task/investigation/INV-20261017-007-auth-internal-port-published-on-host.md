# INV-20261017-007 — Auth internal service port 3101 is published on the host

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused changed-code review (guidance mode, security-review.md) / no full-audit run
- Date and audit scope: 2026-10-17; found while tracing who can reach the new auth internal photo routes (user-photo.md PH-04). The Compose file itself was not changed by this feature.
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree (review hash c6dee7f33779f161). `docker-compose.yml` at HEAD; infra's parallel `auth-storage` volume edit is not part of this hash.
- Related ticket / root-cause fingerprint: compose-auth-port-host-published; it raises the reachability of INV-20261017-006. infra INV-20261017-004 and [backend-api-auth/1](../../infra/services/backend-api-auth/1/security.md) mention the published port but defer it to a separate auth container review; this ticket tracks that item only
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers: `docker-compose.yml` line 61 (`- "3101:3101"` under `backend-api-auth`). The gateway and frontend reach auth through `http://backend-api-auth:3101` on the Compose network (lines 75 and 157), so they do not need the published port.
- Attacker prerequisites and reachable entry point: network reach to the host on port 3101 (bound on all interfaces by default).
- Concrete trust boundary and source-to-sink trace: external client -> host:3101 -> auth `/internal/v1/*` and `/api/auth/*` directly, bypassing the gateway. Auth re-checks the session, licence, grant and target on every user-admin call (DA-01), so this is not an authorization bypass. It does skip gateway-only controls, for example the photo response's CSP sandbox and the gateway's body handling, and it exposes the unauthenticated buffering path in INV-20261017-006 beyond the Compose network. `backend-api-partner` already follows the internal-only pattern (no published port).
- Observed impact and independent verification evidence: static configuration review only.
- Missing validation fact / capability (if any): whether the production host firewall or deployment overrides already block 3101, and whether anything outside Compose (for example host tooling or Better Auth callback URLs, `AUTH_BASE_URL: http://localhost:3101`) relies on the published port.
- Sanitized evidence sufficient for owner review: the line references above.
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: infra; `docker-compose.yml`. This is a shared Docker file, so edits are parent-serialized under infra-delivery.md.
- Suggested remediation: remove the host port publish for `backend-api-auth` in production Compose, or bind it to `127.0.0.1` if a host-local consumer is required. Keep dev-only publishing in `docker-compose.dev.yml` if needed. Confirm `AUTH_BASE_URL` / trusted-origin expectations first.
- SA design / contract / flow / dependency change needed: SA confirmation if a consumer outside Compose depends on 3101.
- Acceptance criteria: in production Compose, auth is reachable only from the Compose network (gateway, frontend), and login, session and user-admin flows still work end to end.
- Safe verification plan and prerequisites: `docker compose config` review plus the infra smoke test of login and the user-admin page through the frontend.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: compose-auth-port-host-published
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
