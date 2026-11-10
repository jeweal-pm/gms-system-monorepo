# INV-20261110-001 — Potential auth process termination via vulnerable body-parser

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / frontend, backend, dependency and Docker static investigation / incomplete; no retained full-audit run
- Date and audit scope: 2026-11-10; frontend, backend, package lock, Dockerfiles and Compose ingress
- Source commit, dirty paths, and relevant content hashes: `26f874bb206aa40324d45a581ebf99f68312ee5c`; dirty `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`; `pnpm-lock.yaml` SHA-256 `0727887f57f63e9405e81efd60b2482cb2cd811d0830d9c14da4cba60dec654a`; `backend-api-auth/src/main.ts` SHA-256 `368836d53d73e170f4cceb4220a21ce17956ab81d23426f064760efc0b4dddd4`
- Related ticket / root-cause fingerprint: `auth-body-parser-compressed-trailing-bytes-crash`; distinct from photo body-buffering ticket [INV-20261017-006](INV-20261017-006-auth-photo-raw-body-unauthenticated-buffering.md) and auth host-port ticket [INV-20261017-007](INV-20261017-007-auth-internal-port-published-on-host.md)
- Category: vulnerability
- Verdict: needs_validation

## Evidence and impact

- Affected files and line numbers: `pnpm-lock.yaml:2243` locks `body-parser@2.3.0`; `backend-api-auth/src/main.ts:37,50,61-62` disables Nest's default parser, attaches `express.json()` with only a size limit, then listens on `0.0.0.0`; `docker-compose.yml:64-65` publishes auth port 3101 in the base profile; `docker-compose.gms.dev.yml:66` removes that publication in the local GMS overlay.
- Attacker prerequisites and reachable entry point: unauthenticated HTTP access to the auth service through an applicable network ingress.
- Concrete trust boundary and source-to-sink trace: an unauthenticated request reaches Express JSON parsing before authentication or route handling. The middleware does not disable compressed request bodies. The GitHub-reviewed [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) (CVE-2026-111181) states that a compressed body followed by trailing bytes can trigger an uncaught exception and terminate a process using the affected default parser; patched in body-parser 2.4.0. The source establishes the affected package version and middleware path, but this audit did not reproduce the crash.
- Observed impact and independent verification evidence: static source and lockfile review by sec-auditor and two independent read-only reviewers. The advisory rates the upstream issue High (CVSS 7.5); this ticket has no project severity because the project-side effect was not reproduced in the required isolated environment.
- Missing validation fact / capability: no bounded, isolated request replay was run; actual production ingress and whether it forwards compressed bodies are not visible. The current local GMS overlay removes auth's host port, while the base Compose file publishes it. Full-audit scratch output could not be created because the prescribed run directory is not ignored; image/CVE scanning was also unavailable.
- Sanitized evidence sufficient for owner review: yes; source paths, lockfile version, advisory and profile differences are listed above. No credentials or payloads retained.
- Raw report/run links: none; full run incomplete.

## Proposed work

- Allowed code scope and assigned implementation role: backend owns the dependency and request-parser behavior; parent integration owner serializes manifest and lockfile changes. Infra owns ingress-profile validation.
- Suggested remediation: evaluate upgrading the resolved body-parser to 2.4.0 or later through a compatible Express/Nest dependency update; alternatively disable inflation only if compressed request bodies are not required. Rebuild the auth image after the selected change.
- SA design / contract / flow / dependency change needed: no SA contract change expected; dependency update needs the normal package review/lockfile integration.
- Acceptance criteria: affected runtime image resolves a patched body-parser; compressed requests no longer terminate the auth process; ordinary login, tRPC and bounded JSON/photo routes continue to work; ingress exposure is recorded for each deployment profile.
- Safe verification plan and prerequisites: use a disposable auth process in the required OS-enforced sandbox, with dummy credentials, isolated loopback, read-only source/toolchain, scratch-only writes, no external network and strict CPU/memory/process/disk/time limits. Do not replay against the running Compose stack.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `auth-body-parser-compressed-trailing-bytes-crash`
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
