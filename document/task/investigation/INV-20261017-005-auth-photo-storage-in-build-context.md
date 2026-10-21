# INV-20261017-005 — `backend-api-auth/storage` (user photos) is not excluded from the Docker build context

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: infra (`.dockerignore`, parent-serialized shared Docker file); devops informed (build context)
- Priority: resolved for the scoped image build-context gap; no image was published
- Auditor / mode / run ID: infra / observation made while implementing approved scope backend-api-auth/1 (PH-10) / none
- Date and audit scope: 2026-10-17. Root `.dockerignore`, `backend-api-auth/Dockerfile`, `docker/dev.Dockerfile`
- Source commit, dirty paths, and relevant content hashes: branch `change-to-nginx-with-new-skill-agent`, HEAD `6bbd932` + current `.dockerignore` change
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
- Missing validation fact / capability: none for this scoped build-context fix; the separate shared-storage target remains pending SA review in [ADR-0029](../../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md).
- Sanitized evidence sufficient for owner review: yes.

## Proposed work

- Allowed code scope and assigned implementation role: infra. Add one line `backend-api-auth/storage` to the root `.dockerignore`, through the parent. This mirrors the partner entry from backend-api-partner/2.
- SA design / contract / flow / dependency change needed: none.
- Acceptance criteria:
  - A dummy file placed in `backend-api-auth/storage/user-photos/` is absent from both production and dev image builds.
  - The production image still has the empty `storage/user-photos` folder from the Dockerfile `RUN` line, owned by 1000.
- Safe verification plan and prerequisites: an authorized image build; no container recreation is needed for the context check.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner request on 2026-10-21: "backend เชค module ที่มีการอัพโหลดรูปของเราตอนนี้ที ว่าทำงานตรงกับเอกสารที่เราอัพเดทกันหรือป่าว ยังมี module ไหนที่เก็บรูป ไฟล์อยู่ใน container อยู่มั้ย ถ้ามีให้ปรับแก้ด้วย"; applied to this exact auth-storage build-context gap because it can package user photos into images. Does not authorize the broader `@gms/storage` migration.
- Approval date: 2026-10-21
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `build-context:auth-storage-not-dockerignored`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- User-authorized extension and new limit: none
- Active pass: none
- Stop reason / missing prerequisite: success; production and dev Dockerfile build-context checks passed. No storage volume or app data was changed.
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
| 1 | parent / selected ticket revision 1 | Root `.dockerignore` omitted auth storage, and both Dockerfiles copy the shared context | Added `backend-api-auth/storage` exclusion | Production auth Dockerfile: marker absent while runtime path exists. Dev Dockerfile: marker absent. Both check images and markers removed. | Resolved; no image published and no volumes touched |

- Assigned owner and start date:
- Changed files / implementation revision: `.dockerignore` now excludes `backend-api-auth/storage`; ticket resolved 2026-10-21.
- Checks performed, results, and limitations: built `backend-api-auth/Dockerfile` with a harmless unique marker under auth storage. Build succeeded; marker was absent at `/app/backend-api-auth/storage/user-photos/` while runtime directory existed. Built `docker/dev.Dockerfile` with a separate harmless marker; marker was absent from the image. Markers and unique check images were removed.
- Follow-up auditor and verification evidence: no application code changed. Shared storage migration is proposed separately; no files/volumes were moved.
- Remaining risk or reopened validation gap: no production image publication occurred. No storage data was migrated; see pending SA revision 1 for the broader GMS storage target.
- Completion report under document/task/done/: not applicable for this narrow one-line build-context correction.
- Final status / date: resolved / 2026-10-21
