# INV-20261110-002 — Base Compose falls back to a public CRM provisioning key

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / frontend, backend, dependency and Docker static investigation / incomplete; no retained full-audit run
- Date and audit scope: 2026-11-10; base Compose credentials, auth provisioning endpoint and ingress profiles
- Source commit, dirty paths, and relevant content hashes: `26f874bb206aa40324d45a581ebf99f68312ee5c`; dirty `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`; `docker-compose.yml` SHA-256 `6505a52d19472cacf985a9d133e30e9cb8235270a5a571437941b10772540ae2`; `backend-api-auth/src/auth/auth.service.ts` SHA-256 `a1f3a0b068484915520012ec07831226c14879353245d351a3eb1f18f9873e9c`
- Related ticket / root-cause fingerprint: `compose-default-crm-api-key-superadmin-provision`; related to but distinct from [INV-20261017-007](INV-20261017-007-auth-internal-port-published-on-host.md), which tracks the published auth port
- Category: vulnerability
- Verdict: needs_validation

## Evidence and impact

- Affected files and line numbers: `docker-compose.yml:40-47,64-65`; `backend-api-auth/src/auth/auth.controller.ts:31-34`; `backend-api-auth/src/auth/auth.service.ts:40-43,56-60`; `backend-api-auth/src/permission/grants.ts:4-15`.
- Attacker prerequisites and reachable entry point: an unauthenticated client able to reach auth port 3101 in a deployment using the base Compose profile, with `CRM_API_KEY` unset or left at the fallback; the requested username must also pass the license preflight or provisioning is denied.
- Concrete trust boundary and source-to-sink trace: base Compose sets `NODE_ENV=production`, falls back to a fixed `CRM_API_KEY`, and publishes auth on all host interfaces. `POST /api/v1/users` checks only the supplied `x-api-key` before provisioning an admin; the grants mapping treats that role as `SUPER_ADMIN`. Thus the fallback value can cross the external-to-admin-provisioning boundary if this profile and port are reachable. A read-only independent source review confirmed the path; no request was sent.
- Observed impact and independent verification evidence: confirmed configuration chain in source, but deployment reachability and actual environment overrides were not observed. No project severity is assigned while that deployment fact remains unverified.
- Missing validation fact / capability: determine whether any deployed production Compose invocation uses the fallback and whether untrusted networks can reach port 3101. The current local GMS overlay removes the published auth port; no live service was inspected.
- Sanitized evidence sufficient for owner review: yes; the public fallback is present in tracked Compose source. It is also named as a production secret replacement prerequisite in `document/adr/tech-stack.md`.
- Raw report/run links: none; full run incomplete.

## Proposed work

- Allowed code scope and assigned implementation role: infra owns Compose secret policy and published ports; parent integration owner serializes Docker files. Backend confirms the CRM integration contract if a fail-closed change is selected.
- Suggested remediation: remove the known fallback from production configuration and fail startup when `CRM_API_KEY` is absent; keep any local-only test credential confined to a development-only overlay. Verify the CRM provisioning key is provisioned outside source and rotated if this profile was used.
- SA design / contract / flow / dependency change needed: validate the CRM provisioning contract and deployment profile before implementation; no new API contract is proposed by this investigation.
- Acceptance criteria: production Compose cannot start with a known CRM key; no untrusted host path reaches CRM provisioning with a public default; the authorized CRM provisioning flow still works with an externally supplied secret.
- Safe verification plan and prerequisites: render Compose without exposing resolved secret values; test missing-key startup and a dummy CRM request in an isolated disposable environment; inspect production profile and firewall/ingress with the deployment owner.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `compose-default-crm-api-key-superadmin-provision`
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
