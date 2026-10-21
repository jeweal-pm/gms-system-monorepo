# SA review — GMS file storage for auth photos and company logo, revision 1

- Date: 2026-10-21 (Asia/Bangkok)
- Status: **superseded before approval by SA revision 2**
- Feature / source UI: `gms-file-storage-migration` / existing approved photo and logo flows
- Proposed ADR: [ADR-0029](../../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md)
- Central TODO: [gms-file-storage-migration](../../task/todo/gms-file-storage-migration.md)
- Infra research: [gms-file-storage revision 1](../../infra/services/gms-file-storage/1/security.md)
- Approval evidence: none; revision 2 incorporates the owner's indefinite-retention instruction

## Findings

There are two backend modules that persist image files: auth user photos and partner company-profile logo. Production currently mounts `auth-storage` and `partner-storage` named volumes at their service storage paths. The checked-out dev containers also have those named volumes mounted. At inspection, auth volume contained 0 files (4 KiB); partner volume contained 1 file (164 KiB). No filename or image content was opened. The source trees and project tests contain no other backend file-writing upload module. Frontend quotation `ItemPhotoBox` creates browser-local object URLs only; its source comment says persistent upload is pending.

The current named volumes survive container replacement and are not ephemeral container-layer storage. They do not yet match GMS spec §8, which requires `@gms/storage`, host fs storage, per-service metadata and protected Nginx delivery. The detailed design and migration constraints are in [architecture](../../apps/backend/storage/gms-file-migration/architecture.md), [authorization](../../apps/backend/storage/gms-file-migration/authorization.md), [sequence](../../apps/backend/storage/gms-file-migration/sequence-diagram.md), [database](../../apps/backend/storage/gms-file-migration/database-diagram.md), [API contract](../../apps/backend/storage/gms-file-migration/api-contract.md), [errors](../../apps/backend/storage/gms-file-migration/error-handling.md), [dependencies](../../apps/backend/storage/gms-file-migration/dependencies.md), and [testing](../../apps/backend/storage/gms-file-migration/testing.md).

## Current validation

- Auth unit suites: 2 files, 22 tests passed (photo storage and user-admin service).
- Partner unit suites: 2 files, 33 tests passed (logo storage and company-profile service).
- Auth production-image build-context regression check: a harmless unique marker was absent from the built image while the runtime storage directory remained present; marker and temporary image were removed.
- Current Compose mount inspection: both storage paths are persistent named volumes. No runtime files were modified or migrated.
- No proposed package, DB migration, production mount, Nginx route, container recreation or storage-volume mutation has occurred.

## Documents and decisions covered by approval

Approval of this exact SA revision would cover: ADR-0029; the eight linked backend design documents; central TODO revision 1; infra research revision 1; adding the `@gms/storage` fs-only workspace package to the package ledger as approved for implementation; migration of the two listed image domains to service-owned `stored_files` using `auth/` and current-owner `partner/` prefixes; and the preservation/cutover/rollback criteria described above. Changing the partner prefix to `master/` is outside this revision and belongs to api-master cutover.

Explicitly outside this approval: deployment/host operations, production mount creation, backup policy selection, data deletion or volume removal, S3/Garage, broad file upload features, quotation photo persistence, and any frontend API/authorization change. These need separately selected scopes if later required.

## Questions for owner review

1. Approve SA revision 1 and ADR-0029 as written, or list decision IDs to change.
2. The GMS spec says deleted files are physically purged after 30 days by a job. No worker exists and this revision does not add one. Choose: (A) a bounded scheduled one-off purge operation for these two low-volume image classes, or (B) defer cutover until a separately approved worker is available.
3. Confirm the package remains fs-only and the current browser-facing APIs/permissions stay unchanged.

Do not begin package installation, schema migration, application refactor or live data migration while this bundle is pending review.
