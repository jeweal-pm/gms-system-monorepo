# INV-20261017-004 — backend-api-auth production image runs as root

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra (Dockerfile/Compose, parent-serialized); devops for the image build impact
- Priority: awaiting user review
- Auditor / mode / run ID: infra / observation made while implementing approved scope backend-api-auth/1 (PH-10) / none
- Date and audit scope: 2026-10-17. Only `backend-api-auth/Dockerfile` and the `backend-api-auth` service in `docker-compose.yml` were inspected, not a full container review
- Source commit, dirty paths, and relevant content hashes: branch `fix/17-10-26-user-permission-logic`, HEAD `d19aa55` + working tree. `backend-api-auth/Dockerfile` sha256 `145bc5089e212a4f038f77221dd92bced2626805d79ff90c56f4822158355b03`, `docker-compose.yml` `3b3b1188451f5d24ab82cfb27c454bdc312ce204d18655038b46f019a8f3563f`
- Related ticket / root-cause fingerprint: [backend-api-auth/1](../../infra/services/backend-api-auth/1/security.md) gap G1 / `auth-image:no-user+no-runtime-hardening`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-auth/Dockerfile`: there is no `USER` instruction, so the process runs as uid 0 from the base image `node:24.11.0-bookworm-slim`.
  - The `CMD` runs `pnpm … db:migrate && pnpm … start` through corepack at runtime.
  - `docker-compose.yml` service `backend-api-auth` has no `user`, `read_only`, `cap_drop`, `security_opt: no-new-privileges`, pids limit or log rotation. Its port `3101:3101` is published.
- Attacker prerequisites and reachable entry point: no vulnerability is claimed. This is a defence-in-depth gap. If code execution occurs in auth, the process has root in the container with default capabilities and a writable root filesystem, including app code and `node_modules`. The new `auth-storage` volume is also writable.
- Concrete trust boundary: container process → container filesystem and kernel interface. `backend-api-partner` already runs as `USER 1000:1000` with `read_only`, `cap_drop: ALL` and `no-new-privileges` (bundle backend-api-partner/1).
- Observed impact and independent verification evidence: static inspection only.
- Missing validation fact / capability: whether auth needs any root-only action at runtime. Expected none: it listens on port 3101 (> 1024) and runs Prisma `migrate deploy` over the network. Also whether corepack/pnpm can run without egress as uid 1000. Partner had to switch to `./node_modules/.bin/prisma` and `node dist/main.js` for this reason.
- Sanitized evidence sufficient for owner review: yes, see the file references above.

## Proposed work

- Allowed code scope and assigned implementation role: infra edits `backend-api-auth/Dockerfile` and the `backend-api-auth` service in `docker-compose.yml`, both through the parent. Devops gets the image change.
- Suggested remediation:
  - Follow the partner pattern: `WORKDIR /app/backend-api-auth`, `ENV NODE_ENV=production`, `USER 1000:1000`, and `CMD` = `./node_modules/.bin/prisma migrate deploy && exec node dist/main.js` (no pnpm at runtime).
  - Then consider `read_only: true` + `/tmp` tmpfs, `cap_drop: ALL`, `no-new-privileges`, `init: true`, a pids limit and json-file log rotation.
  - Each of these needs a version-specific research bundle (backend-api-auth/2).
  - **Data step:** photos written while auth ran as root are owned by root, mode 0640. A one-time `chown -R 1000:1000` of the `auth-storage` volume, run in a controlled one-off container, is needed before switching. Without it, uid 1000 cannot read or replace those files.
- SA design / contract / flow / dependency change needed: none expected. The published port and network membership belong to a separate review.
- Acceptance criteria:
  - `docker compose exec backend-api-auth id -u` returns 1000.
  - Login, the internal routes and photo upload/overwrite/remove work.
  - Migrations run at startup.
  - A write outside `storage/` fails when `read_only` is adopted.
  - Existing photos are still readable.
- Safe verification plan and prerequisites: dev or staging image build and container recreation, with explicit authorization. Never prune volumes.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `auth-image:no-user+no-runtime-hardening`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: awaiting user review
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
