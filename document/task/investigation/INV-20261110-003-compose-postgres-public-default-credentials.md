# INV-20261110-003 — Base Compose publishes PostgreSQL with known default credentials

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / frontend, backend, dependency and Docker static investigation / incomplete; no retained full-audit run
- Date and audit scope: 2026-11-10; base Compose database credentials, port publication and service connection strings
- Source commit, dirty paths, and relevant content hashes: `26f874bb206aa40324d45a581ebf99f68312ee5c`; dirty `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`; `docker-compose.yml` SHA-256 `6505a52d19472cacf985a9d133e30e9cb8235270a5a571437941b10772540ae2`
- Related ticket / root-cause fingerprint: `compose-postgres-published-with-known-superuser-credential`; no matching investigation ticket found
- Category: vulnerability
- Verdict: needs_validation

## Evidence and impact

- Affected files and line numbers: `docker-compose.yml:13-20,43,96`; `document/infra/services/backend-api-partner/1/security.md:122` documents the dev-only `f1_user` exception, while base `docker-compose.yml:1-3` describes the production host profile.
- Attacker prerequisites and reachable entry point: a network client able to reach the host's published PostgreSQL port 5432 while this base profile is active.
- Concrete trust boundary and source-to-sink trace: base Compose sets `POSTGRES_USER=f1_user` and a fixed development password, publishes `5432:5432` without a loopback bind, and reuses those credentials in auth/master connection strings. The [official PostgreSQL image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md) states that `POSTGRES_USER` creates a user with superuser power. An untrusted network client that can reach the published port can authenticate directly to PostgreSQL, bypassing application authorization and access the database role's schemas/data. No database request was made.
- Observed impact and independent verification evidence: configuration chain confirmed by two independent read-only reviews. No project severity is assigned because actual deployment profile, network reachability and database role state were not inspected.
- Missing validation fact / capability: determine whether a deployed host uses this base profile, whether an external firewall blocks 5432, whether the credential was overridden/rotated, and whether runtime grants differ from the Compose bootstrap user.
- Sanitized evidence sufficient for owner review: yes; tracked source and connection strings establish the default path. No credential value is repeated here beyond the repository's development username/password identifiers.
- Raw report/run links: none; full run incomplete.

## Proposed work

- Allowed code scope and assigned implementation role: infra owns Compose port/secrets; backend owns database-role provisioning; parent integration owner serializes Compose changes.
- Suggested remediation: ensure production profile does not publish PostgreSQL to host interfaces and fails closed on development database credentials; use a least-privilege runtime role and externally managed secrets. Keep developer-only access in a local overlay bound to loopback.
- SA design / contract / flow / dependency change needed: backend/SA confirmation for runtime database-role ownership and migration needs before changing credentials or grants.
- Acceptance criteria: production PostgreSQL is reachable only from required service networks; production startup cannot use the committed dev credential; auth/master use only their approved least-privilege roles; local development remains available only on an intentional host binding.
- Safe verification plan and prerequisites: render production and local Compose profiles without printing resolved secrets; inspect grants on a disposable database; validate host firewall/bindings with the deployment owner. Never probe a production or shared database.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `compose-postgres-published-with-known-superuser-credential`
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
