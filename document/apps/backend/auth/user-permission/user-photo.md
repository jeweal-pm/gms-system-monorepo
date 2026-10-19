# User photo with file storage (user-permission, SA revision 4 proposal)

- Date: 2026-10-17. Status: **approved 2026-10-17** (owner: "อนุมัติ PH"; Q-PH-1 = 5 MB and Q-PH-2 = tile only, both defaults) and **implemented**. See the [changelog](../../../../changelog/2026-10-17-user-photo.md).
- Owner request (verbatim): "ช่วยจัดการรูปภาพหน้า user permission หน่อย โดยใช้หลักการ file storage"
- Replaces the deferred items BE-UP-009/012 and unblocks FE-UP-013 ([central TODO](../../../../task/todo/user-permission.md)). Same pattern as the approved company logo (company-profile SA-CP-04…06), applied to the auth service.
- Today: table `auth."UserPhoto"` exists and stores the image bytes in the database (`data BYTEA`). It has **0 rows** (checked 2026-10-17), and no API reads or writes it. `hasPhoto` is always `false` and `photoVersion` is always `null`.

## Decisions (approve "PH as written", or name an ID to change it)

| ID | Decision | Why / alternatives |
|---|---|---|
| PH-01 | **Owner: `backend-api-auth`** (it owns users). Each photo is a file `storage/user-photos/<userId>` under the auth working directory. Only the user-admin module uses this folder | Same as the company logo, which lives in its owning service. Rejected: partner storage, because partner does not own users. |
| PH-02 | **One file per user, overwritten on upload.** Writes use a temp file in the same folder, then an atomic rename, under the `User` row lock. Remove deletes the file. Deleting the user also deletes the file (after the transaction; a failure is logged and the orphan is harmless) | Owner rule from the logo ("อัพรูปใหม่ไปจะไปทับรูปเก่า"). No history. |
| PH-03 | **DB keeps metadata only.** Migration drops `UserPhoto.data`; `content_type`, `size_bytes`, `sha256` and `updated_at` stay. The table is empty, so there is no data step | File storage instead of BYTEA (owner). |
| PH-04 | **Binary REST path, not tRPC.** Gateway `PUT/GET /api/v1/user-admin/users/:id/photo` (session cookie) calls auth `PUT/GET /internal/v1/user-admin/users/:id/photo`. Raw body with `Content-Type: image/jpeg \| image/png`. Removal is tRPC `userAdmin.removePhoto({ id })`. The frontend already proxies `/api/v1/*` | tRPC has a 1 MB JSON limit, and base64 adds about 33%. Raw bytes keep memory at about 1× the file per hop. |
| PH-05 | **Limits:** JPEG or PNG only (the design says "JPEG or PNG only"), **≤ 5 MB** (5,242,880 bytes). The server checks that the file signature matches `Content-Type`. No re-encoding or resizing | Auth runs on 0.5 CPU / 1 GB. A photo needs less than the 10 MB logo. Body limit applies to this route only; JSON stays at 32 kB. |
| PH-06 | **Permissions:** GET = `user-and-permission:VIEW`. Upload and remove = `user-and-permission:EDIT` and the target must be manageable (ADR-0023 DA-03…05). A Super Admin may change any photo, including a Super Admin's, because the photo is personal information. The caller's own photo is not changed on this page (DA-05). It moves to the Profile page later | Same rules as the other user fields. |
| PH-07 | **Versioning:** `photoVersion` = first 16 hex of `sha256`, already in `userAdmin.get`. Images are served at `…/photo?v=<photoVersion>` with `Cache-Control: private, max-age=31536000, immutable`. A photo change does **not** change `User.updatedAt`, so saving the form and uploading the photo never conflict (`USER_CHANGED`) | Same as the logo `?v=`. |
| PH-08 | **Order of saves:** create or edit saves the fields first, then uploads or removes the photo for that user id. If the photo step fails, the fields stay saved and the page shows "Details saved, but the photo couldn't be updated" | Same as company-profile SA-CP-09. Keeps each request small. |
| PH-09 | **Errors:** `PHOTO_TOO_LARGE` (413), `PHOTO_TYPE_NOT_ALLOWED` (415, signature or type mismatch), `PHOTO_NOT_FOUND` (404 on GET), plus the existing `USER_NOT_FOUND`, `PERMISSION_DENIED` and `USER_NOT_MANAGEABLE` | — |
| PH-10 | **Production storage (infra):** a named volume `auth-storage` mounted at `/app/backend-api-auth/storage` in `docker-compose.yml`. Infra reviews it as bundle `backend-api-auth/<next>` (same shape as `partner-storage`). Dev writes into the git-ignored repo folder `backend-api-auth/storage/` | Without a volume, photos are lost when the container is recreated. |

## Frontend (FE-UP-013, after approval)

- **Photo tile** (UI spec C-08):
  - Click or drop a file. The browser checks type and size, then shows a preview.
  - In create/edit mode, "Remove" clears the photo.
  - The photo uploads after Save (PH-08).
  - View mode shows the saved image (`<img>` from the `?v=` URL).
  - The tile is disabled without EDIT, for unmanageable users, and for your own account.
- **Users drawer:** keeps initials. No thumbnails, so opening the page does not trigger up to 600 image requests (Q-PH-2).

## Work after approval

1. **SA:** API contract, sequence diagram and ADR note. Infra bundle for PH-10.
2. **Auth:**
   - Migration and storage helper.
   - Internal routes (raw body ≤ 5 MB on this route only).
   - Remove photo, and delete the file when the user is deleted.
   - Tests.
3. **Gateway:** REST controller (like `company-profile-logo.controller.ts`) and `userAdmin.removePhoto`. Tests.
4. **Frontend:** photo tile, upload/remove after save, error messages. Tests.
5. Restart and integration check. Dual security review before handoff.

## Open questions (defaults used if not answered)

- **Q-PH-1:** Size limit 5 MB? Default 5 MB.
- **Q-PH-2:** Show photos in the users drawer and the top-bar avatar? Default no; only the Personal Information tile, for now.
