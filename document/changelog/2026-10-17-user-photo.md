# 2026-10-17 User photo with file storage (User and Permission)

Owner: "ช่วยจัดการรูปภาพหน้า user permission หน่อย โดยใช้หลักการ file storage", then "อนุมัติ PH". Implements [user-photo.md](../apps/backend/auth/user-permission/user-photo.md) PH-01…10 with the Q-PH defaults (5 MB; the photo is shown only in the Personal Information tile).

## Auth

- `src/user-admin/photo-storage.ts` (new):
  - One file per user at `storage/user-photos/<userId>`. Only `[A-Za-z0-9_-]{1,64}` ids are accepted as file names.
  - A new upload overwrites the old file atomically (temp file + rename).
  - JPEG/PNG signature check, 5 MB limit.
- Migration `20261017140000_user_photo_file_storage`: drops `UserPhoto.data`. The table keeps metadata only; it had 0 rows. Applied in dev.
- `user-admin.service.ts`:
  - `putPhoto` and `removePhoto` run under the `User` row lock. Callers need EDIT and a manageable target (ADR-0023). Nobody changes their own photo on this page.
  - `getPhoto` returns `PHOTO_NOT_FOUND` when either the metadata or the file is missing.
  - Deleting a user also removes the file.
- Internal routes GET/PUT/DELETE `/internal/v1/user-admin/users/:id/photo`.
  - In `main.ts`, only this route accepts a raw body (≤ 5 MB, JPEG/PNG), and only after a session pre-check.
  - A too-large body returns 413 `PHOTO_TOO_LARGE`.
- New error codes: `PHOTO_TOO_LARGE`, `PHOTO_TYPE_NOT_ALLOWED` and `PHOTO_NOT_FOUND`.
- Dev photo files go into the git-ignored `backend-api-auth/storage/`.

## Gateway

- `src/user-photo.controller.ts` (new): GET (VIEW) and PUT (EDIT) at `/api/v1/user-admin/users/:id/photo`.
  - GET returns the immutable cache header only when `?v=` matches the current version; it also sends `nosniff` and a sandbox CSP.
  - PUT accepts JPEG/PNG only and streams the body with a 5 MB limit.
- `userAdmin.removePhoto` (EDIT).
- `auth-client.ts`: raw uploads, a bounded binary GET (`getAuthBinary`), and 415 mapping.

## Frontend

- `features/user-permission/photo.ts` (new): client checks, the versioned photo URL, the upload call and error messages.
- `components/photo-tile.tsx` (new), which replaces the "Photo upload isn't available yet" placeholder:
  - the saved photo in view mode
  - pick, preview, replace and remove in create/edit
  - a spinner while uploading
  - read-only without edit rights, for your own account, and for unmanageable users
- Page: the photo uploads or is removed after the details save (PH-08). If that fails, the toast says "Details saved, but the photo couldn't be updated: …".

## Checks

- Tests: auth 30 (new UT-PH-01…05, UT-PH-S01…S06); gateway 225 pass, 7 skipped (new UT-PH-G01…G09); frontend 273 (new UT-PH-F01…F05).
- Typecheck and lint pass in all three.
- Live check as the dev Super Admin through `localhost:3000`, using user `pun`; the test photo was removed afterwards:

  | Check | Result |
  |---|---|
  | Upload a PNG | 200, new `photoVersion` |
  | `userAdmin.get` | `hasPhoto: true` and the same version |
  | GET `?v=` | 200 `image/png`, immutable cache, bytes identical; the file exists in `storage/user-photos/` |
  | GIF bytes sent as PNG | 415 |
  | Your own photo | 403 `USER_NOT_MANAGEABLE` |
  | More than 5 MB | 413 `PHOTO_TOO_LARGE` |
  | `removePhoto` | ok, and the file is gone |
  | GET afterwards | 404 `PHOTO_NOT_FOUND` |
  | Unauthenticated GET | 401 |
  | `/setup/user-permission` | 200 |

- Pre-existing, not changed: the Next `/api/v1` proxy forwards `Expect: 100-continue`, which undici rejects with a 500. Browsers don't send this header; curl does for bodies over 1 MB. It affects the company logo route too.
- Not run: browser checks of the tile, and a check as a delegated user.

## Infra (PH-10)

- Infra bundle [backend-api-auth/1](../infra/services/backend-api-auth/1/security.md).
- `docker-compose.yml`: named volume `auth-storage` mounted at `/app/backend-api-auth/storage`.
- `backend-api-auth/Dockerfile`: creates `storage/user-photos` owned by 1000:1000.
- Both Compose renders pass.
- Not done:
  - rebuild or recreate (the running dev container still writes to the repo folder until it is recreated)
  - checks S1-1…S1-4
  - production rollout
- Hardening tickets:
  - [INV-20261017-004](../task/investigation/INV-20261017-004-auth-runtime-runs-as-root.md): auth runs as root.
  - [INV-20261017-005](../task/investigation/INV-20261017-005-auth-photo-storage-in-build-context.md): `.dockerignore` does not exclude `backend-api-auth/storage`.

## Security review: **blocked**

Both reviews checked the same source: HEAD d19aa55 plus the working tree, hash c6dee7f33779f161.

- **Blocking (both reviewers confirm):** [INV-20261017-006](../task/investigation/INV-20261017-006-auth-photo-raw-body-unauthenticated-buffering.md), low severity.
  - Auth `main.ts` session-checks only PUT, but `express.raw` buffers up to 5 MB for any method on the photo route.
  - An unauthenticated GET/POST/DELETE with an image content type is buffered.
  - Fix: parse PUT only, plus a middleware test.
- **Hardening, pending owner review:**
  - [INV-20261017-007](../task/investigation/INV-20261017-007-auth-internal-port-published-on-host.md): auth port 3101 is published on the host (infra).
  - [INV-20261017-008](../task/investigation/INV-20261017-008-photo-binary-routes-no-aggregate-bound.md): no limit on concurrent photo uploads or downloads.
  - [INV-20261017-009](../task/investigation/INV-20261017-009-photo-file-io-inside-db-transaction.md): file I/O runs inside the DB transaction, so file and metadata can get out of sync if it fails.
- **Clear:** path traversal, temp file and rename, XSS and content sniffing, CSRF, gateway/auth permission parity, deleted-user photos, caching, logging.
- The photo TODOs stay open until INV-20261017-006 is selected and fixed, or the owner decides otherwise.
