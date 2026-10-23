# Errors and recovery: GMS file storage migration

- Feature / SA revision: `gms-file-storage-migration` / 3
- Status: implementation in progress; SA revision 3 approved 2026-10-21

Keep all existing upload/read/remove error codes and HTTP statuses from [auth photo contract](../../auth/user-permission/user-photo.md) and [company profile contract](../../partner/company-profile/api-contract.md). Map storage failures to those existing service errors; do not leak host path, bucket key, filesystem errors, signed tokens or secrets.

Upload pipeline: reject invalid content type/signature and over-limit bodies before publication. A stream/disk error cleans its own `.tmp` file; a metadata transaction failure leaves a non-readable orphan for reconciliation and returns the existing generic storage failure. A metadata record is downloadable only at `ready`. Replacement switches metadata only after new bytes are verified; old bytes are marked deleted after switch and remain retained indefinitely. Entity deletion hides uploaded assets but leaves their metadata tombstones and bytes. If disk space cannot cover a new upload plus safe atomic publication, reject it without altering any prior object. No purge retry or deletion operation is permitted for user uploads in any module.

Recovery must compare source/destination counts and SHA-256, retain the original named volumes, and stop cutover on any mismatch. No automated retry loop or purge worker is included. Record bounded retry counts for migration tooling and halt on first repeated integrity mismatch.
