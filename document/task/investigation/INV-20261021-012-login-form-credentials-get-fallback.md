# INV-20261021-012 — Login form can submit credentials in the URL

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: frontend
- Priority: high; credentials may be exposed in browser history and proxy access logs
- Auditor / mode / run ID: scoped read-only code and runtime diagnosis; no full audit
- Date and audit scope: 2026-10-21; login form SSR and active local Nginx ingress
- Source commit, dirty paths, and relevant content hashes: `7cf2be9`; clean source at inspection
- Related ticket / root-cause fingerprint: `frontend-login-native-form-default-get`
- Category: vulnerability
- Verdict: confirmed
- Vulnerability severity: high

## Evidence and impact

- Affected files and line numbers:
  - `frontend/src/features/auth/login-form.tsx:97` renders the login `<form>` without an explicit `method` or `action`.
  - `frontend/src/features/auth/login-form.tsx:115,122` renders named `username` and `password` inputs.
  - `docker/nginx/gms-dev.conf:73-75` forwards general page requests to the frontend.
- Attacker prerequisites and reachable entry point: a login form submission occurs before client hydration or while its submit handler is unavailable (for example, JavaScript fails or is delayed). Browsers default a form without `method` to GET.
- Concrete trust boundary and source-to-sink trace: server-rendered `/login` contains `<form class="..." noValidate="">` with named username/password inputs and no method; native form submission therefore serializes both values into the query string. Runtime response inspection confirmed those SSR attributes without printing any input values. Active Nginx configuration uses the default `main` access log format with `"$request"` and writes `/var/log/nginx/access.log`, which records the request URI including query arguments.
- Observed impact and independent verification evidence: the code path is confirmed; no actual credential-bearing GET request or credential value was captured. Normal hydrated submission calls `authClient.signIn.username(...)`, but that does not protect the pre-hydration native fallback.
- Missing validation fact / capability (if any): confirm whether a user has previously submitted the form in the fallback state; do not inspect or copy any sensitive browser history/log values as part of this record.
- Sanitized evidence sufficient for owner review: SSR form tag had no `method`; named input fields were `username` and `password`; active Nginx access log uses `$request`. No credential values were collected.
- Raw report/run links: none

## Proposed work

- Allowed code scope and assigned implementation role: frontend login form; coordinate a scoped Nginx log adjustment only if frontend remediation alone cannot prevent exposure of legacy query requests.
- Suggested remediation: explicitly prevent GET submission (for example, set the form method to POST and ensure the no-JavaScript fallback does not place credentials in the URL); ensure login request logging does not persist query arguments. Do not include credential values in telemetry or errors.
- SA design / contract / flow / dependency change needed: no
- Acceptance criteria: server-rendered login form cannot submit username/password in a query string before hydration; normal login continues to send credentials in the request body; a safe test with dummy credentials confirms no query string is generated; relevant unit/integration tests pass; no secrets appear in logs.
- Safe verification plan and prerequisites: use disposable dummy credentials only; verify server-rendered form attributes and a no-hydration submit in an isolated local browser; inspect only sanitized request paths and log-format behavior.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: user requested a check and stated the possible credential-in-URL behavior is dangerous; this does not select the code fix.
- Approval date: pending
- Separate approved SA bundle/revision, if required: not required

## Implementation and resolution

- Selected work ID / root-cause fingerprint: pending selection / `frontend-login-native-form-default-get`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: awaiting user selection of this revision before code changes
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: pending selection
- Changed files / implementation revision: none
- Checks performed, results, and limitations: SSR markup, source, and active Nginx log format inspected read-only; no sensitive values collected.
- Follow-up auditor and verification evidence: pending implementation
- Remaining risk or reopened validation gap: pre-hydration native form can serialize credentials in the query; whether a real credential was exposed is unknown.
- Completion report under document/task/done/: none
- Final status / date: pending-review
