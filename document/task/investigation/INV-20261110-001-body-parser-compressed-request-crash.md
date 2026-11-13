# INV-20261110-001 — Potential auth process termination via vulnerable body-parser

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-13, pass 1; see Resolution)
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

- Approved ticket revision: current
- Actual user instruction / approval evidence: owner 2026-11-13: "แก้ไข INV-20261110-001" — fix now
- Approval date: 2026-11-13
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `auth-body-parser-compressed-trailing-bytes-crash`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / `2126ec01` + working tree | Every Express JSON/raw parser in auth and api-master resolved body-parser 2.3.0 (advisory: patched in 2.4.0) | root pnpm override → body-parser 2.4.0; auth parser extracted | `pnpm why`, in-process tests, sandboxed repro, full suites: pass | resolved |

- Assigned owner and start date: backend, 2026-11-13.
- Changed files / implementation revision: branch `fix/12-11-26-inv`, base `2126ec01` + uncommitted working tree. See Resolution (pass 1).
- Checks performed, results, and limitations: see Resolution (pass 1).
- Follow-up auditor and verification evidence: security reviews are routed once by the parent on the final revision.
- Remaining risk or reopened validation gap: see Resolution (pass 1).
- Completion report under document/task/done/: [2026-11-13 INV fixes](../done/2026-11-13-inv-fixes.md)
- Final status / date: resolved, 2026-11-13.

## Resolution (pass 1)

- Dependency change (the one allowed manifest/lockfile change; parent integration owner to serialize):
  - `pnpm-workspace.yaml`: `overrides: "body-parser@>=2.0.0 <2.4.0": 2.4.0` (pnpm 10.22.0). express 5.2.1 already allows `^2.2.1`, so no express / `@nestjs/platform-express` change was needed; the override only stops a lockfile from resolving a vulnerable 2.x again.
  - `pnpm-lock.yaml` (`pnpm install --lockfile-only`): `body-parser` 2.3.0 → **2.4.0** (published 2026-10-22, integrity `sha512-Ifk1KcLr…`); its new range `qs ^6.16.1` added **qs 6.17.1** (published 2026-10-28) for body-parser only (express keeps qs 6.16.0); `overrides` block recorded. pnpm also re-serialized the `eslint-plugin-import@2.32.0` snapshot peer key (same versions, no package change), as on 2026-10-14.
  - `pnpm why body-parser -r` after install: every importer (backend-api-auth, backend-api-master, frontend via its workspace links) → `express 5.2.1 → body-parser 2.4.0`; no 2.3.0 left. Both Dockerfiles copy `pnpm-workspace.yaml` + the lockfile and run `pnpm install --frozen-lockfile`, so the next auth / api-master image build resolves 2.4.0.
- Code: `backend-api-auth/src/http/json-body.ts` (new) — `authJsonBody()` = `express.json({ limit: "32kb" })`, used by `backend-api-auth/src/main.ts` for `/api/auth/trpc` and the catch-all JSON parser (behaviour unchanged; compressed bodies stay accepted). api-master code is unchanged (`express.json({ limit: "256kb" })` and `express.raw` resolve the same patched package).
- Tests:
  - `backend-api-auth/test/http/json-body.integration.test.ts` IT-BP-01…03 (new; in-process Express app on an ephemeral 127.0.0.1 port, no running stack): resolved body-parser ≥ 2.4.0; gzip body + trailing bytes in the same chunk, in a later chunk, or a half gzip member → 400; deflate / brotli / zstd (where Node has it) + trailing bytes → never 5xx; no `uncaughtException`; plain and well-formed gzip requests still parse (200).
  - `backend-api-master/test/master/body-parser.integration.test.ts` IT-BP-M01/M02 (new): same version guard and gzip + trailing bytes → 400 on the api-master parser.
  - Full suites on a fresh disposable PostgreSQL 18.6: auth 24 files / 111 passed / 6 skipped; master 725 passed / 15 skipped; tsc and eslint clean.
- Isolated reproduction attempt (scratch only; disposable container from the dev image, Node 24.11.0, `--network none --memory 256m --cpus 0.5 --pids-limit 64 --read-only`): body-parser 2.3.0 and 2.4.0 side by side with gzip / deflate / brotli / gzip-magic trailing bytes, same chunk and delayed chunk. Neither version terminated the process on these variants (gzip → 400, deflate/brotli → 200, the trailing bytes are ignored by zlib). The upstream crash path was therefore **not reproduced**; the fix relies on the advisory's patched release, whose `read.js` now detaches the decompression stream with an error listener after the body is read and checks the charset before piping into a decoder.
- Dev containers: the named node_modules volumes were updated with the project's install command (`docker compose … run --rm --no-deps -e CI=true frontend pnpm install --frozen-lockfile --store-dir=/root/.local/share/pnpm/store`, no volume removed), then `backend-api-auth`, `api-master`, `frontend`, `nginx` restarted and `docker/repair-dev-networks.cjs` run.
- Remaining items (not backend scope): rebuild and roll out the auth / api-master images through devops (no image was built or pushed here); infra to record auth ingress exposure per deployment profile (base Compose publishes 3101; GMS overlay removes it), as in the acceptance criteria.
