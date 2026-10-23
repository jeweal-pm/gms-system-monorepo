# GMS file storage migration — SA revision 3

- Feature ID / SA revision: `gms-file-storage-migration` / 3
- Source UI revision / TODO: existing `user-permission` photo and `company-profile` logo behavior / [central TODO](../../../../task/todo/gms-file-storage-migration.md)
- Status: implementation in progress; SA revision 3 approved 2026-10-21
- ADR / review bundle: [ADR-0029](../../../../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md) / [SA review](../../../../reviews/sa/2026-10-21-gms-file-storage-rev1.md)
- Related accepted design: [GMS spec §8 and Appendix B](../../../../gms-platform-spec.md), [ADR-0027](../../../../adr/0027-gms-master-inventory-data-and-operations.md), [auth photo contract](../../auth/user-permission/user-photo.md), [company profile contract](../../partner/company-profile/decisions.md)
- Infra research: [gms-file-storage infra revision 3](../../../../infra/services/gms-file-storage/3/security.md)

## Domain and boundaries

Auth remains owner of user photos; the existing partner service remains owner of the company profile until its separately staged api-master cutover. Each service owns its `stored_files` metadata in its own PostgreSQL schema. Bytes move from `auth-storage` and `partner-storage` named volumes into the GMS filesystem profile at `/srv/gms/storage`; no cross-schema writes, new container, or third-party file service is proposed. The shared `@gms/storage` workspace is approved for implementation and is being added.

Preserve the current REST/tRPC routes, session/permission checks, image limits and types, hashes, cache/version behavior, error contracts, and one-file-per-entity semantics. Implement streaming through the approved package boundary; backend modules must not use `fs` or an S3 SDK directly for persisted files. New user-uploaded image keys in the `files` bucket use `{module}/{filename}`: `company-profile/<filename>` and `user-photo/<filename>`. The module may supply its own safe basename; if it does not, `@gms/storage` generates a UUIDv7 filename with the requested extension. With local `GMS_STORAGE_ROOT=C:\\dev\\f1-system\\storage`, the logo path is `storage/files/company-profile/<filename>`. Existing `partner/company-profile/...` and `auth/user-photo/...` keys remain readable and are never moved or removed automatically. Each adapter allows only its assigned module prefix plus its own exact legacy prefix. Do not treat the logo as public: it retains current authorization.

## Behavior and consistency

Upload writes to `.tmp`, validates size/type/signature and SHA-256 while streaming, atomically publishes the object, then commits `stored_files.status=ready` and domain association. Failed DB commit leaves a detectable orphan for bounded reconciliation; failed object write does not publish metadata. Replacement publishes the new object before switching metadata, then marks the prior row `deleted`; both metadata and bytes remain indefinitely. Remove and owning-entity deletion also mark the row `deleted` without cascading metadata or unlinking bytes. `purge_after` stays null; no purge worker, lifecycle rule, scheduled job or Docker operation may delete **any user-uploaded file** in `files` or `public`, now or in future modules. System-generated documents/exports retain their type-specific lifecycle. This follows the owner direction captured in GMS spec v1.2 draft and ADR-0030. Download uses existing domain authorization and a short-lived package URL / Nginx internal delivery; never expose a directory or raw object key.

Existing response fields are derived from ready metadata. Keep user photo versions as the first 16 SHA-256 hex characters and company logo `?v=` semantics. No browser-visible API route or authorization is changed in this revision.

## Capacity, rollout and rollback

No new service/container or database connection pool. Current per-upload bounds remain 5 MiB for user photo and 10 MiB for logo; other upload features keep their own approved limits. Stream bytes without whole-file buffering. Permanent retention across all uploads means unbounded cumulative disk growth. Capacity, disk budget, free-space alert and upload admission/rejection thresholds, off-host backup target and recovery targets are prerequisites and remain unselected. Reject an upload safely when disk space cannot cover the write plus atomic-publish overhead; never delete retained objects to make room. Use sequential migrations and migration batches; do not run an all-at-once copy in app startup.

Rollout: verified backup of DB and both volumes; create host path with exact UID/GID and restrictive permissions; deploy backward-compatible metadata schema and adapter; copy in bounded batches with source/destination size and SHA-256 checks; verify counts and permissioned reads; pause writes for final delta and atomically switch reads/writes; retain original volumes read-only through the rollback window. Rollback switches to old compatible code/metadata while old data remains intact. Never delete either source volume as part of migration.

## Container infrastructure

See exact research and candidate mounts in the linked infra bundle. APIs need read-write access limited to their assigned module folders and legacy read paths; Nginx needs read-only access only for protected file delivery; frontend has no mount. Deployment waits for API and Nginx implementations, host storage path/owner, backup/recovery decision, and measured disk/CPU/RAM. The local Docker Desktop preview must not create Linux `/srv/gms/storage` or migrate workstation volumes automatically.
