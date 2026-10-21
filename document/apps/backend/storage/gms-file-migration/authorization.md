# Authorization: GMS file storage migration

- Feature / SA revision: `gms-file-storage-migration` / 3
- Status: implementation in progress; SA revision 3 approved 2026-10-21

`backend-api-auth` continues to authorize user photo reads with `user-and-permission:VIEW`, and upload/remove with `user-and-permission:EDIT` plus target-manageability rules. `backend-api-partner` continues to enforce `company-profile:VIEW` for logo reads and `company-profile:EDIT` for upload/removal through the gateway session. Storage keys and package URLs are never authorization. Backend validates bucket/service prefix (`auth/` for auth and `partner/` for the current company-profile owner) and entity association before returning or mutating bytes. Any user-uploaded object marked deleted is inaccessible through normal APIs but its metadata and bytes remain retained indefinitely, regardless of module. Nginx's internal file location rejects direct browser requests; only an authorized API can emit the internal redirect/token. No permission, actor, session or route changes are included.

Integration cases must prove authorized and unauthorized read/write, cross-prefix denial, expired/invalid download token denial, and no public path traversal. No new roles or credentials are introduced by this design.
