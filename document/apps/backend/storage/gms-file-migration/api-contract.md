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

Internal storage operations use approved `@gms/storage` (`putStream`, `head`, `get`, protected download capability). New user-uploaded image keys use their assigned module prefix (`company-profile/`, `user-photo/`) followed by an immutable UUID filename; each adapter also permits its own legacy service prefix for reads. The driver's low-level `delete` operation must never be called for a committed user upload. Every future user-upload endpoint must create service-owned metadata and follow indefinite retention; system-generated `documents` and `exports` keep separate lifecycle rules. Error codes/status mapping stays unchanged.
