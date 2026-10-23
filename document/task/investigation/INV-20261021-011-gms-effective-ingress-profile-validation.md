# INV-20261021-011 — Effective GMS ingress profile is not established

## Tracking

- Ticket revision: 1
- Status: needs-validation
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor + security-auditor / focused changed-code review
- Date and audit scope: 2026-10-21; base Compose, GMS dev overlay, Nginx and CI Compose validation
- Source commit, dirty paths, and relevant content hashes: HEAD plus scoped working-tree manifest SHA-256 `676f0b1368c1da3c8bb4dea6941ebb7fbb78a4f3e812914595b42473a29ed437` (146 code/config paths)
- Related ticket / root-cause fingerprint: `gms-platform/effective-ingress-profile-unproven`; related [INV-20261021-001](INV-20261021-001-gms-preview-auth-bypasses-ingress.md)
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `docker-compose.yml:30-65`; `docker-compose.gms.dev.yml`; `docker/nginx/gms-dev.conf`; `.github/workflows/ci.yml` Compose validation step.
- Attacker prerequisites and reachable entry point: depends on the production host's effective Compose profile and firewall; no Internet exposure is asserted.
- Concrete trust boundary and source-to-sink trace: base Compose publishes auth, frontend and PostgreSQL host ports and contains no Nginx. The GMS dev overlay adds loopback Nginx and removes auth's published port, but inherits frontend and PostgreSQL publications. No production GMS profile or deployment evidence establishes Nginx as the sole ingress. CI checks base and base+dev, not the GMS overlay.
- Observed impact and independent verification evidence: both reviewers could not verify the effective production profile or host firewall; this is a cutover validation blocker, not a confirmed exposure.
- Missing validation fact / capability (if any): identify and render the actual production profile; verify host bindings/firewall and that only intended Nginx ingress is reachable; validate GMS overlay/Nginx in CI.
- Sanitized evidence sufficient for owner review: the profile and CI paths above; current development config is not treated as production proof.
- Raw report/run links (local, ignored evidence may not exist on another checkout): focused reviewer results in this conversation; related local-preview port finding [INV-20261021-001](INV-20261021-001-gms-preview-auth-bypasses-ingress.md).

## Proposed work

- Allowed code scope and assigned implementation role: infra Compose/Nginx profiles; parent owns shared Compose/CI file integration.
- Suggested remediation: document/render the actual production service profile, bind public ingress only through Nginx, remove unintended host port publication, and add deterministic CI validation for the selected GMS profile.
- SA design / contract / flow / dependency change needed: none expected for deployment-profile verification; coordinate with SA if the approved public ingress contract changes.
- Acceptance criteria: effective production topology is documented and rendered; only intended ingress is externally reachable; Nginx reaches required services over private networks; CI validates the profile; capacity and rollback constraints remain bounded.
- Safe verification plan and prerequisites: inspect the deployment target's configuration and firewall without changing it; render Compose; perform local-only port reachability checks where available.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: none; validation gap is staged for user review
- Approval date: none
- Separate approved SA bundle/revision, if required: approved Nginx-only target ingress; deployment profile still requires evidence.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: owner selection and production profile evidence required
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: pending user selection
- Changed files / implementation revision: none
- Checks performed, results, and limitations: static config review only; no deployed host or firewall was inspected
- Follow-up auditor and verification evidence: pending selected validation
- Remaining risk or reopened validation gap: effective production ingress is unknown
- Completion report under document/task/done/: none
- Final status / date: needs-validation
