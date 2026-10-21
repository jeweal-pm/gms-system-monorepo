# API contract impact: GMS file storage migration

- Feature / SA revision: `gms-file-storage-migration` / 3
- Status: implementation in progress; SA revision 3 approved 2026-10-21

Public API: unchanged in this revision. Retain existing operations:

| Existing operation | Auth/permission | Request/response compatibility |
|---|---|---|
| `PUT /api/v1/user-admin/users/:id/photo` | Session; `user-and-permission:EDIT`; manageable target | Raw JPEG/PNG, max 5 MiB; response retains SHA version |
| `GET /api/v1/user-admin/users/:id/photo?v=...` | Session; `user-and-permission:VIEW` | Private image bytes, content type and immutable version cache |
| `userAdmin.removePhoto({id})` | Session; `EDIT`; manageable target | Same tRPC response/errors |
| `PUT /api/v1/company-profile/logo` | Session; `company-profile:EDIT` | Raw JPEG/PNG, max 10 MiB; same response and profile version behavior |
| `GET /api/v1/company-profile/logo?v=...` | Session; `company-profile:VIEW` | Private image bytes, same cache/version behavior |
| `companyProfile.removeLogo` | Session; `company-profile:EDIT` | Same tRPC response/errors |

Internal storage operations use proposed `@gms/storage` (`putStream`, `head`, `get`, protected download capability) and must enforce the `files`/`public` bucket plus current service prefixes `auth/` and `partner/`. The driver's low-level `delete` operation must never be called for a committed user upload; a later move to `master/` belongs to the separately staged api-master cutover. Every future user-upload endpoint must create service-owned metadata and follow indefinite retention; system-generated `documents` and `exports` keep separate lifecycle rules. No new browser-facing route, API package or dependency is approved until this SA revision is approved. Error codes/status mapping stays byte-for-byte compatible; any necessary deviation returns to SA review.
