# INV-20261017-005 — `backend-api-auth/storage` (user photos) is not excluded from the Docker build context

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra (`.dockerignore`, parent-serialized shared Docker file); devops informed (build context)
- Priority: awaiting user review. Recommended before the first production build that contains PH-10
- Auditor / mode / run ID: infra / observation made while implementing approved scope backend-api-auth/1 (PH-10) / none
- Date and audit scope: 2026-10-17. Root `.dockerignore`, `backend-api-auth/Dockerfile`, `docker/dev.Dockerfile`
- Source commit, dirty paths, and relevant content hashes: branch `fix/17-10-26-user-permission-logic`, HEAD `d19aa55` + working tree. `.dockerignore` sha256 `ef4d59ec7cf01e6ff00d001cd904b82ecd1e21480b130fefcbf9a18a79e768a6` (unchanged)
- Related ticket / root-cause fingerprint: [backend-api-auth/1](../../infra/services/backend-api-auth/1/security.md) gap G2 / `build-context:auth-storage-not-dockerignored`
- Category: privacy-control
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `.dockerignore:18` excludes only `backend-api-partner/storage`. There is no entry for `backend-api-auth/storage`.
  - `backend-api-auth/Dockerfile:12` and `docker/dev.Dockerfile` (`COPY . .`) copy the whole context.
  - `.gitignore:20` already ignores `backend-api-auth/storage/` for git.
- Path:
  1. A host-run auth process (tests or `pnpm dev` outside Docker), or the dev container before it is recreated with the new volume, writes user photos into `<repo>/backend-api-auth/storage/user-photos/`.
  2. An image build copies them into `/app/backend-api-auth/storage/user-photos/` in the image.
  3. On first start in a new environment, Docker populates the empty `auth-storage` volume from the image directory.
- Observed impact and independent verification evidence:
  - Personal photos, which are user data, could ship inside images and registries.
  - Dev photos could also be seeded into a production volume as orphan files.
  - Static inspection only. Today the host folder exists and holds 0 files (2026-10-17), so nothing has leaked yet.
- Missing validation fact / capability: a build-context check, for example a dummy file that must be absent from the built image. Not run.
- Sanitized evidence sufficient for owner review: yes.

## Proposed work

- Allowed code scope and assigned implementation role: infra. Add one line `backend-api-auth/storage` to the root `.dockerignore`, through the parent. This mirrors the partner entry from backend-api-partner/2.
- SA design / contract / flow / dependency change needed: none.
- Acceptance criteria:
  - A dummy file placed in `backend-api-auth/storage/user-photos/` is absent from both the production and dev images.
  - The production image still has the empty `storage/user-photos` folder from the Dockerfile `RUN` line, owned by 1000.
- Safe verification plan and prerequisites: an authorized image build; no container recreation is needed for the context check.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `build-context:auth-storage-not-dockerignored`
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
