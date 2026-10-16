# Container security: backend-api-partner / 2

- **Service ID / infra revision / status:** `backend-api-partner` / 2 / **approved scope, implementing** (inherits every control of [revision 1](../1/security.md); this revision only adds persistent storage)
- **Parent task / authorization:** feature `company-profile`, SA revision 2 ([decisions](../../../../apps/backend/partner/company-profile/decisions.md)); owner 2026-10-16: "บันทึกลงใน folder ใน backend เลยเมื่ออัพรูปใหม่ไปจะไปทับรูปเก่า logic นี้ แค่ module company profile เท่านั้น อนุมัติ company-profile SA revision 1"
- **Research:** inline by the parent (infra role applied sequentially), 2026-10-16. Sources: [Compose volumes](https://docs.docker.com/reference/compose-file/volumes/) and [services `volumes`/`read_only`](https://docs.docker.com/reference/compose-file/services/); [Docker volumes](https://docs.docker.com/engine/storage/volumes/): when an empty named volume is mounted over an image directory that has content, the content (and ownership) is copied into the volume ("populate a volume using a container"); this is how the uid 1000 owner reaches the volume. Review-by 2027-01-14 (same as revision 1).

## Change

| Setting | Revision 1 | Revision 2 | Reason / evidence needed |
|---|---|---|---|
| Writable storage | none (read-only root, `/tmp` tmpfs 16 MB) | named volume `partner-storage` → `/app/backend-api-partner/storage` | Company logo file (one file ≤ 10 MB, overwritten). Root filesystem stays `read_only: true` |
| Image directory | — | `RUN mkdir -p /app/backend-api-partner/storage/company-profile && chown -R 1000:1000 /app/backend-api-partner/storage` before `USER 1000:1000` | So the new volume is created owned by uid 1000; the process still cannot write app files or `node_modules` |
| Dev | bind mount `.:/app`, root | same; files land in `backend-api-partner/storage/` on the host, which is git-ignored and docker-ignored | No secret or user file enters git or an image build context |
| Size bound | — | application limit: one `logo` file + one temp file during replacement (≤ 20 MB). Docker local volumes have no quota | Accepted: single admin-only upload path; revisit if more uploads are added |
| Backups | `pg_dump` | `pg_dump` **plus** a copy of volume `partner-storage` (ops) | The DB holds only logo metadata (type, size, sha256); the bytes live in the volume. Missing file → logo GET 404 and the page shows the empty tile |

## Controls kept

`read_only: true`, `cap_drop: ALL`, `no-new-privileges`, `USER 1000:1000`, internal networks, no published port, resource limits, log rotation, token auth: unchanged. No new network, port, secret or environment variable (the path is a constant relative to the working directory).

## Acceptance

| ID | Check | Result |
|---|---|---|
| S2-1 | Production image: `stat -c %u /app/backend-api-partner/storage` = 1000; a write outside the volume fails (read-only) | not run (needs a production-image build; agent environment cannot build images reliably) |
| S2-2 | Dev: upload, overwrite and remove the logo; only `storage/company-profile/logo` exists afterwards; `git status` shows nothing under `storage/` | **pass** 2026-10-16: volume `f1-system_partner-storage` created; PNG then 10 MB JPEG overwrote the file; removal left an empty folder; dev also mounts the named volume over the bind mount (merged config), so nothing is written to the repo |
| S2-3 | Recreate the container: the logo is still served | not run |

## DevOps impact

`backend-api-partner/Dockerfile` gains one `RUN` line; no new build args, variables or image targets. The image build in CI is unchanged otherwise.
