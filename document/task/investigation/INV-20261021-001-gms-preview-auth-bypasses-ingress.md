# INV-20261021-001 — Local GMS preview still publishes auth outside Nginx

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: parent fallback / focused infra configuration review / none
- Date and audit scope: 2026-10-21; local GMS preview overlay and merged Compose host-port exposure
- Source commit, dirty paths, and relevant content hashes: HEAD `d2ac3f3`; dirty `docker-compose.gms.dev.yml`, `docker/nginx/gms-dev.conf`, `docker-compose.yml`; preview manifest SHA-256 `21c830e4f1c92567fccd049fdb9ddd090696f7a1d15cceea931efcd71493575a`
- Related ticket / root-cause fingerprint: `gms-preview/auth-host-port-bypasses-nginx`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers: `docker-compose.yml:64-65` publishes auth `3101:3101`; the GMS preview overlay adds Nginx on `127.0.0.1:8080` but does not override the inherited auth mapping (`docker-compose.gms.dev.yml:42-45`). The base also publishes gateway and frontend ports for legacy development access.
- Attacker prerequisites and reachable entry point: a device able to reach the workstation's published Docker host port; actual network reachability depends on the host firewall and network.
- Concrete trust boundary and source-to-sink trace: external host client → Docker-published TCP 3101 → Better Auth directly, bypassing the new Nginx entry at `127.0.0.1:8080`. This also bypasses Nginx path controls and its per-IP login rate limit. This is a local development preview configuration, not a production deployment finding.
- Observed impact and independent verification evidence: merged Compose source retains the `3101:3101` publication while the overlay's intended browser path uses Nginx. No exploit or remote reachability test was performed.
- Missing validation fact / capability (if any): host firewall and LAN reachability are unknown; Compose runtime publication was not tested from a second device.
- Sanitized evidence sufficient for owner review: the port mapping and overlay service definition above.
- Raw report/run links (local, ignored evidence may not exist on another checkout): none

## Proposed work

- Allowed code scope and assigned implementation role: infra; local preview Compose ingress only, with parent owning shared Compose changes.
- Suggested remediation: decide whether the preview should clear inherited `backend-api-auth` host ports and rely on Nginx only; preserve a documented direct diagnostic method only if needed and loopback-bound. Do not rename/remove the legacy gateway or partner services in this ticket.
- SA design / contract / flow / dependency change needed: none expected for local-only port binding; recheck if public route or service contract changes.
- Acceptance criteria: merged preview publishes only intended loopback Nginx ingress for auth traffic; auth remains reachable from Nginx on the Compose network; health/login/session and rate-limit paths work; rollback path is documented; no database volume is removed.
- Safe verification plan and prerequisites: inspect merged Compose port bindings, verify Nginx-to-auth connectivity, confirm host auth direct access is unavailable, and rerun login/session plus Nginx health checks.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: none; finding is staged for user review
- Approval date: none
- Separate approved SA bundle/revision, if required: existing SA rev 1 covers the target Nginx-only ingress; this ticket concerns local preview implementation.

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
- Checks performed, results, and limitations: static Compose inspection only; no exploitability claim
- Follow-up auditor and verification evidence: pending ticket selection
- Remaining risk or reopened validation gap: inherited host-published ports may bypass Nginx in local preview
- Completion report under document/task/done/: none
- Final status / date: pending-review
