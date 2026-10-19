# INV-20261017-003 — User-admin password hashing has no request limit, now reachable by delegated admins

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (gateway or auth limiter; infra only if a container/proxy limit is chosen)
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only, static) / no run ID
- Date and audit scope: 2026-10-17; user-permission delegated admin (delegated-admin.md DA-01…07, ADR-0023): auth `user-admin`, gateway `userAdmin.*`, frontend user-permission page
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree; sha256(first 16) of `git diff -- backend-api-auth/src backend-api-gateway/src frontend/src/features/user-permission` = 20de628e1e67cf24; untracked `backend-api-auth/src/user-admin/delegation.ts` afe34e1a94ee99df…, `frontend/src/features/user-permission/access.ts` 58e5e5eedb7884eb…
- Related ticket / root-cause fingerprint: none (distinct from INV-20261017-002) / `user-admin:argon2-hash-unthrottled`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/user-admin/user-admin.service.ts` L222 (`argon2.hash` on update with `password`), `backend-api-auth/src/user-admin/user-provisioning.service.ts` L73 (hash on create); `backend-api-auth/src/user-admin/user-admin.controller.ts` L32-50 (no limiter); `backend-api-gateway/src/trpc/router.ts` `userAdmin.create/update` (no limiter). Better Auth `rateLimit` (`backend-api-auth/src/auth/auth.ts` L60-68) covers only Better Auth routes, not the Nest `internal/v1/user-admin/*` controller.
- Attacker prerequisites and reachable entry point: an authenticated, licensed non-Super-Admin with `user-and-permission:EDIT` (or `:ADD`), and one manageable target, for example a user they created or a user with no grants. Entry point: `userAdmin.update` / `userAdmin.create`, or auth `PATCH|POST /internal/v1/user-admin/users` inside Compose.
- Concrete trust boundary and source-to-sink trace: browser -> gateway `permittedProcedure("user-and-permission","EDIT")` -> auth `requireAccess("EDIT")` -> DA-03 pre-check (L207-216, passes for a manageable target) -> `argon2.hash` (argon2 0.44.0 defaults: memoryCost 64 MiB, timeCost 3, parallelism 4) runs once per request with no count/time limit. The gateway gives up after 5 s (`AUTH_TIMEOUT_MS.write`), but auth still finishes the hash.
- Observed impact and independent verification evidence: static reading only. The auth container is limited to 0.5 CPU / 1 GiB (`docker-compose.yml` L31-35). The libuv threadpool caps concurrent hashes at 4 (≈256 MiB), so memory stays bounded, but CPU is not. A tight loop of password-reset or create requests can saturate auth's CPU and delay sign-in (`argon2.verify` in Better Auth, L39) and session checks for every user. Before this change only a Super Admin could reach this. Delegation lets any account granted EDIT/ADD reach it. This is not a privilege escalation: the actor already holds the grant.
- Missing validation fact / capability (if any): actual per-hash CPU time on the production host and whether a reverse proxy in front of the gateway applies a request limit (not visible in the repository).
- Sanitized evidence sufficient for owner review: yes (above).
- Raw report/run links: none (focused review, no full run).

## Proposed work

- Allowed code scope and assigned implementation role: backend `backend-api-gateway/src/trpc/**` or `backend-api-auth/src/user-admin/**` and tests.
- Suggested remediation: add a small per-actor limit for the password-hashing user-admin mutations (for example a few creates/password resets per actor per minute), plus a small global concurrency cap on user-admin hashing in auth. Answer `429` with a stable domain code, and log only actor ID and count.
- SA design / contract / flow / dependency change needed: yes if a new error code or a limiter library is introduced (contract/dependency review); none if an in-process counter reuses existing error handling.
- Acceptance criteria: repeated password-reset or create calls by one actor beyond the limit are rejected before `argon2.hash`; Super Admin behavior is defined explicitly; tests cover the limit and the reset window; memory stays bounded (no unbounded per-actor map).
- Safe verification plan and prerequisites: unit tests with mocked Argon2 and a fake clock; no load test against shared or live services.

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
