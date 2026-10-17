# INV-20261017-002 — Delegated admins with equal grants can reset, deactivate or delete each other

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (design change needs SA; frontend follows the `manageable` flag)
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused changed-code review (guidance mode, read-only) / no run ID
- Date and audit scope: 2026-10-17; user-permission delegated admin (delegated-admin.md DA-01…07, ADR-0023), auth `user-admin`, gateway `userAdmin.*`, frontend user-permission page
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree; sha256(first 16) of `git diff -- backend-api-auth/src backend-api-gateway/src frontend/src/features/user-permission` = 20de628e1e67cf24; untracked `backend-api-auth/src/user-admin/delegation.ts` sha256 afe34e1a94ee99df…, `frontend/src/features/user-permission/access.ts` sha256 58e5e5eedb7884eb…
- Related ticket / root-cause fingerprint: none / `user-admin:DA-03-subset-includes-equal-peers`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/user-admin/delegation.ts` `isManageableTarget` (target manageable when `ungrantableKeys(actor, target.permissions).length === 0`, i.e. target grants ⊆ actor grants, equality included); `backend-api-auth/src/user-admin/user-admin.service.ts` update L207-216, L232-235 (password reset L222, L263-271), delete L337-341.
- Attacker prerequisites and reachable entry point: an authenticated, licensed non-Super-Admin holding `user-and-permission:EDIT` (or `:DELETE`); `userAdmin.update` / `userAdmin.delete` via gateway tRPC, or auth `PATCH|DELETE /internal/v1/user-admin/users/:id`.
- Concrete trust boundary and source-to-sink trace: actor A and peer B hold identical grant sets that include `user-and-permission:EDIT`/`DELETE`. A calls `update(B, { password })` -> `requireAccess("EDIT")` passes -> `isManageableTarget(A, B)` is true because B ⊆ A -> new Argon2 hash written to B's credential account and B's sessions revoked. A now knows B's password and can sign in as B. Likewise `active: false` or `delete` removes B. B can do the same to A concurrently.
- Observed impact and independent verification evidence: no permission escalation (DA-02/DA-03 hold: B never has a grant A lacks), so this is not a vulnerability. Residual risks within the approved design: (1) a delegated admin can take over a peer administrator's account, so later actions are attributed to the peer in audit logs; (2) peer delegated admins can lock each other out (deactivate/delete), leaving only a Super Admin to recover. Static reading only; unit tests UT-DA-06/S07/S10 confirm the subset rule but do not cover equal-peer cases.
- Missing validation fact / capability (if any): owner intent for equal-grant peers was not stated; Q-DA-1 (password reset with EDIT) was accepted by default.
- Sanitized evidence sufficient for owner review: yes (above).
- Raw report/run links: none (focused review, no full run).

## Proposed work

- Allowed code scope and assigned implementation role: backend `backend-api-auth/src/user-admin/{delegation.ts,user-admin.service.ts}` and tests; frontend only if UI copy changes.
- Suggested remediation (owner choice, SA to record): (a) treat targets that themselves hold any `user-and-permission:ADD|EDIT|DELETE` as manageable only by a Super Admin, or (b) require a strict superset for those targets, and/or (c) restrict password reset of such targets to Super Admin (narrowing Q-DA-1). Option (a) is simplest and keeps DA-02…05.
- SA design / contract / flow / dependency change needed: yes, DA-03/Q-DA-1 decision change (ADR-0023 amendment); no schema or dependency change.
- Acceptance criteria: chosen rule enforced in auth both in the pre-check and under the FOR UPDATE row lock for update and delete; `get().manageable` reflects it; unit tests cover equal-peer update/password-reset/deactivate/delete.
- Safe verification plan and prerequisites: auth unit tests with mocked Prisma; gateway unaffected (it only checks the action grant).

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
