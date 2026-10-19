# INV-20261019-002 — Production bootstrap for schema `stone` would require widening the partner DB role

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra (production DB role/bootstrap procedure in bundle backend-api-partner); backend for any migration change; sa if SA-SM-01 wording changes
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused changed-code review (security-review.md) / no full run
- Date and audit scope: 2026-10-19; stone-master UI rev 1 + SA rev 1 + ADR-0024. Partner migration, Prisma schema, rollout notes and the existing partner infra bundle only
- Source commit, dirty paths, and relevant content hashes: branch `feat/19-10-26-stone-master`, HEAD `79dfe91` + working tree; review hash `403639a6858cd27a` (sha256 first 16 hex over the stone-master diff + file list defined in the review handoff)
- Related ticket / root-cause fingerprint: `partner-db-role:create-schema-stone-needs-database-CREATE`. Related to the existing unverified migration risk in [backend-api-partner/1 security.md](../../infra/services/backend-api-partner/1/security.md) (schema `partner`). Not a duplicate of INV-20261019-001 (options response size)
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-partner/prisma/migrations/20261019090000_stone_master/migration.sql:5`: `CREATE SCHEMA IF NOT EXISTS "stone";`, run by `prisma migrate deploy` as the partner runtime role.
  - `backend-api-partner/prisma/schema.prisma` (datasource `schemas = ["partner", "stone"]`).
  - `document/changelog/2026-10-19-stone-master.md:86-88` and `document/apps/backend/partner/stone-master/decisions.md:12` (SA-SM-01) say the role "needs CREATE on the database ..., or a DBA creates the schema first".
  - `document/infra/services/backend-api-partner/1/security.md:121-163`: production role `f1_partner` is NOCREATEDB, owns schema `partner` only and has no database `CREATE`. The bootstrap creates only schema `partner`. For the same pattern on `partner`, the preferred fallback is a temporary `GRANT CREATE ON DATABASE` plus `REVOKE`, not a permanent grant.
  - `document/infra/service-index.md`: has no entry or bundle revision for the new `stone` schema.
- Attacker prerequisites and reachable entry point: no vulnerability is claimed. This is a least-privilege and rollout gap. If the role is given a standing database `CREATE` to make the migration pass, a compromised partner process (or its credentials) could create further schemas in `f1_system`.
- Concrete trust boundary and source-to-sink trace: deploy → partner container `migrate deploy` (role `f1_partner`) → PostgreSQL `f1_system`, which is shared with schema `auth`.
- Observed impact and independent verification evidence: static inspection only. In PostgreSQL's `CreateSchemaCommand`, the database `CREATE` privilege check appears to run before the `IF NOT EXISTS` short-circuit. If so, the documented alternative "a DBA creates the schema first" would still fail for a role without database `CREATE`. That would leave a permanent grant as the only documented option that works, which conflicts with the infra bundle's least-privilege intent.
- Missing validation fact / capability (if any):
  - Whether PG 18.6 rejects `CREATE SCHEMA IF NOT EXISTS "stone"` for a role without database `CREATE` when `stone` already exists and is owned by that role. This was not executed; no live or scratch database was contacted.
  - Whether production uses `f1_partner` yet. The bundle says the bootstrap is not done.
- Sanitized evidence sufficient for owner review: yes (file/line references above; no credentials or data).
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role:
  - infra: `document/infra/services/backend-api-partner/` (new bundle revision for schema `stone`) and the `document/infra/service-index.md` entry, parent-serialized.
  - backend: only if the migration must change (e.g. a separate DBA-run step instead of `CREATE SCHEMA` in the app migration).
- Suggested remediation:
  1. Extend the `f1_partner` bootstrap with `CREATE SCHEMA IF NOT EXISTS stone AUTHORIZATION f1_partner;`, plus a privilege self-check for `stone`. Keep NOCREATEDB and no database `CREATE`.
  2. Verify on a scratch PG 18.6 whether the migration's `CREATE SCHEMA IF NOT EXISTS` then passes as `f1_partner`.
  3. If it does not pass, choose one documented option: a one-time `GRANT CREATE ON DATABASE` / `REVOKE` window for the deploy, or move schema creation out of the app migration into the DBA bootstrap. Update SA-SM-01 and the changelog rollout note to match. Do not keep a standing grant.
- SA design / contract / flow / dependency change needed: only a wording change to the SA-SM-01 rollout note if option 3 is chosen; no API or schema contract change.
- Acceptance criteria:
  - The production bootstrap for `stone` is documented in the partner infra bundle and the service index.
  - `migrate deploy` is proven on scratch PG 18.6 as a role with the documented production privileges.
  - The steady-state `f1_partner` has no database `CREATE` and no access to `auth`.
- Safe verification plan and prerequisites: a scratch PG 18.6 container with a role that copies the production attributes. No production or shared database. The run needs explicit authorization.

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
