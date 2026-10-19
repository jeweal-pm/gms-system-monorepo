# Container security: backend-api-auth / 1

- **Service ID / infra revision / status:** `backend-api-auth` / 1 / **implemented (config only), unverified at runtime; production rollout not done**. This is the first infra bundle for auth. It covers **only** the persistent photo storage (SA PH-10). It does **not** review or approve the rest of the auth container. That container is still `not-reviewed`: it runs as root, has a writable root filesystem, no `cap_drop` and a published port.
- **Parent task / authorization:** feature `user-permission`, user photo with file storage. SA document [user-photo.md](../../../../apps/backend/auth/user-permission/user-photo.md) decision PH-10 (sha256 `5fa6f78f…dbebbbfb…02ec04`, full `5fa6f78fa95edbebbbfb1d5ca294be11fe244257adcab88c5cc895b4c102ec04`). The document header still says "pending owner review". The owner approval was relayed by the parent: on 2026-10-17 the owner wrote "อนุมัติ PH", which covers PH-01…10 as written. The parent assigned infra as the only writer of `docker-compose.yml` and `backend-api-auth/Dockerfile` for this scope.
- **Research:** infra role, 2026-10-17, using these official sources:
  - [Docker volumes](https://docs.docker.com/engine/storage/volumes/). When an empty volume is mounted over a container directory that already has files, Docker copies those files into the volume by default ("populate a volume using a container"). `volume-nocopy` turns this off. The page does **not** say whether ownership is copied. The partner precedent relies on Engine behavior here, so this needs a runtime check (S1-1).
  - [Compose merge](https://docs.docker.com/reference/compose-file/merge/). Service `volumes` entries merge by `target`. This is why the base `auth-storage` mount stays in the merged dev config.
  - [Compose volumes](https://docs.docker.com/reference/compose-file/volumes/) and [services `volumes`](https://docs.docker.com/reference/compose-file/services/).
- **Platform:** local Docker 29.8.2 and Compose v5.5.1. The production host version is unknown.
- **Review-by:** 2027-01-17, three months after the research date, the same cadence as the partner bundles. The research must be redone before that date if any of these change:
  - the base image `node:24.11.0-bookworm-slim` or the Engine/Compose version
  - the runtime user (INV-20261017-004)
  - the storage path, photo limits or number of upload routes
  - a move to `read_only`
  - backup tooling
  - a Docker volume advisory

## Required communication (unchanged)

No change. Frontend server → auth (`http://backend-api-auth:3101`), gateway → auth (internal photo routes `/internal/v1/user-admin/users/:id/photo`, same port and auth as the other internal routes), auth → postgres:5432. The photo bytes travel over the existing paths. There is no new network, port, egress, secret or environment variable. The path is a constant relative to `process.cwd()`. `pnpm --filter @gem-crm/backend-api-auth start` runs `node dist/main.js` in `/app/backend-api-auth`, so the path resolves to `/app/backend-api-auth/storage/user-photos`.

## Change

| Setting | Before | Revision 1 | Reason / evidence |
|---|---|---|---|
| Writable storage | Only the container's writable layer. Photos would be lost when the container is recreated | Named volume `auth-storage` mounted at `/app/backend-api-auth/storage` (top-level `volumes:`) | PH-10. One file `storage/user-photos/<userId>` per user, at most 5 MB, JPEG or PNG. The app writes a temp file `.photo-<uuid>.tmp` in the same folder, then renames it atomically. Files are mode 0640 |
| Image directory | none | `RUN mkdir -p /app/backend-api-auth/storage/user-photos && chown -R 1000:1000 /app/backend-api-auth/storage` | Same pattern as `backend-api-partner/Dockerfile:18`. The image has **no `USER`**, so the runtime is **root**. Ownership by uid 1000 is not needed for root to write. It only prepares the volume for a future non-root runtime. See INV-20261017-004 (advisory, owner infra). The runtime user was **not** changed: that is outside the approved scope |
| Dev (`docker-compose.dev.yml`) | bind mount `.:/app`, root dev image | **No file change.** Note: Compose merges by target, so the merged dev config **also mounts `auth-storage`** over the bind mount (rendered, see C2). Photos written by the dev container go into the named volume `<project>_auth-storage`, not into the repo | The repo folder `backend-api-auth/storage/` is git-ignored (`.gitignore:20`, checked with `git check-ignore`). Only host-run processes (tests, `pnpm dev` outside Docker) write there. The same behavior was recorded for partner (backend-api-partner/2, S2-2) |
| Build context | — | **Not changed (outside scope).** `.dockerignore` does not exclude `backend-api-auth/storage` | Dev or test photos on the host can enter both image build contexts through `COPY . .`. They would then be copied into a **new** production `auth-storage` volume. Recorded as INV-20261017-005. Fix it before the first production build |
| Size bound | — | App bound: at most 5 MB per user plus one temp file per upload in progress. Docker local volumes have no quota. Growth is about `users × 5 MB` (1,000 users is at most about 5 GB) | Accepted for this scope. Production host disk facts are unknown (gap G3) |
| Backups | `pg_dump` | `pg_dump` **plus** a copy of volume `auth-storage` (ops) | The DB keeps only metadata (`content_type`, `size_bytes`, `sha256`, PH-03). If the file is missing, GET returns 404 `PHOTO_NOT_FOUND` |
| Resources | 0.5 CPU / 1 GB | unchanged | Raw-body route at most 5 MB, about 1× the file in memory per hop (PH-04/05). The production total is unchanged |

## Controls kept / not reviewed

No auth control changed: same networks (default), published port `3101:3101`, environment, `depends_on` and limits. Auth has none of the partner hardening (`read_only`, `cap_drop`, `no-new-privileges`, non-root, log rotation, pids limit). Those belong to a separate auth container review. INV-20261017-004 records the non-root part.

## File hashes (sha256, working tree, 2026-10-17; branch `fix/17-10-26-user-permission-logic`, HEAD `d19aa55`)

| File | Before (HEAD) | After |
|---|---|---|
| `docker-compose.yml` | `d9f07b238d9b42b76d1342b1aa38ab680bdba89d4b47e1b526a984826bd22fc0` | `3b3b1188451f5d24ab82cfb27c454bdc312ce204d18655038b46f019a8f3563f` |
| `backend-api-auth/Dockerfile` | `99a675896714dfeaef677db80d1fdc833e0f1c22e1444f7668ebe94b9c5dd460` | `145bc5089e212a4f038f77221dd92bced2626805d79ff90c56f4822158355b03` |
| `docker-compose.dev.yml` (unchanged) | `0d744d0ef25038f07cc2f8c8c001a78b6e75c3fcb3b2557eb968e83dce4c4f7d` | same |
| `.dockerignore` (unchanged) | `ef4d59ec7cf01e6ff00d001cd904b82ecd1e21480b130fefcbf9a18a79e768a6` | same |
| `.gitignore` (unchanged by infra) | `c11c560b65921b95b855640683214b65d5ca26d7b2b6873e293ae4328e43f05c` | same |
| `backend-api-auth/src/user-admin/photo-storage.ts` (backend, read only) | — | `80ca4b20560b10e8c1de376f20cc2bc6a7946e2c9dbe35eec5cd1e7d73728060` |

## Checks

| ID | Check | Result |
|---|---|---|
| C1 | `docker compose -f docker-compose.yml config --quiet` | **pass** (exit 0). Rendered JSON: auth has one volume `auth-storage → /app/backend-api-auth/storage`. Top-level volumes are `auth-storage, partner-storage, postgres-data`. No other service mounts `auth-storage`. Only the volume fields were extracted; resolved environment values were not printed |
| C2 | `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet` | **pass** (exit 0). Merged auth volumes: `auth-storage → /app/backend-api-auth/storage` plus the bind `.:/app` and the dev `node_modules`/prisma volumes. The user is still the image default (root) and the root filesystem is writable |
| C3 | `git check-ignore backend-api-auth/storage/user-photos/<file>` | **pass**: `.gitignore:20 backend-api-auth/storage/`. The host folder `backend-api-auth/storage/user-photos/` exists and has 0 files (2026-10-17) |
| S1-1 | Production image: `stat -c '%u %a' /app/backend-api-auth/storage /app/backend-api-auth/storage/user-photos` gives 1000 for both, and a new `auth-storage` volume gets the same owner | **not run**. No image build or container recreation was authorized |
| S1-2 | Upload, overwrite and remove a photo through the gateway. Afterwards only `storage/user-photos/<userId>` exists, with no leftover `.photo-*.tmp` and mode 0640 | **not run** (container not recreated) |
| S1-3 | Recreate auth (`up -d --no-deps backend-api-auth`). The photo is still served and `photoVersion` is unchanged | **not run** |
| S1-4 | Build context: a dummy file in `backend-api-auth/storage/user-photos/` must not appear in the image | **not run**. Expected to **fail** until INV-20261017-005 is fixed |

The static render does not prove runtime ownership, persistence or isolation.

## Rollout

- **Dev:** the running dev auth container (if any) does not have the volume until it is recreated. Recreation was **not done**. Until then the dev container writes into the repo folder. After recreation, files already in the repo folder are hidden by the volume and are not migrated. That is acceptable here, because the folder has 0 files today.
- **Production:** **not done.** It needs an image rebuild and a recreate of `backend-api-auth`, with explicit deployment authorization. Fix INV-20261017-005 first.
- **Rollback:** remove the two Compose lines and the `RUN` line, then recreate. **Do not delete** the `auth-storage` volume. Photos remain in it and their metadata in `auth."UserPhoto"`. Without the volume, GET returns 404 for those users after the next recreate.

## Gaps

- **G1:** auth runs as root (INV-20261017-004, advisory, owner infra).
- **G2:** `.dockerignore` lacks `backend-api-auth/storage` (INV-20261017-005, owner infra, parent-serialized one-line change).
- **G3:** production host disk size and volume backup tooling are unknown.
- **G4:** S1-1…S1-4 have not run.
- **G5:** the header of the SA document `user-photo.md` still says pending review. The approval evidence is the parent's relay of the owner's message. SA should update the header.

## DevOps impact

`backend-api-auth/Dockerfile` gains one `RUN` line. There are no new build args, variables, secrets or image targets, and the build context is unchanged (until INV-20261017-005). Production deploy steps must preserve the named volume `auth-storage` and add it to the backup scope.
