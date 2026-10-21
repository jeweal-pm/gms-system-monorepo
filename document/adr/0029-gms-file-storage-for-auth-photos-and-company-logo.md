# ADR-0029: Move auth photos and company logo to GMS shared file storage

- **Status:** Accepted for implementation — SA revision 3; production rollout separately gated
- **Date:** 2026-10-21
- **Feature / source UI revision:** `gms-file-storage-migration` / existing flows
- **SA revision:** 3
- **Deciders:** project owner
- **Approval evidence:** Owner authorized backend implementation on 2026-10-21 and confirmed UI deletion means hiding while retaining bytes permanently.
- **Related:** [GMS spec v1.2 §8 / Appendices A-B](../gms-platform-spec.md), [ADR-0021](0021-company-profile-in-partner-service.md), [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md), [SA review](../reviews/sa/2026-10-21-gms-file-storage-rev3.md)

## Context

`backend-api-auth` writes user photos to `storage/user-photos` and `backend-api-partner` writes the company logo to `storage/company-profile/logo`. Production Compose mounts each path as a persistent named volume, so the files survive ordinary container replacement; they are not merely in the ephemeral writable layer. However, the platform target requires the shared `@gms/storage` interface, `/srv/gms/storage` fs profile, service-prefixed keys and service-owned `stored_files` metadata. The package is not present and the target mount has not been configured.

The exact current behavior and evidence are in the [auth photo contract](../apps/backend/auth/user-permission/user-photo.md), [company profile decisions](../apps/backend/partner/company-profile/decisions.md), and [central TODO](../task/todo/gms-file-storage-migration.md).

## Decision

Propose a staged migration of current auth user photos and the company profile logo through the existing `fs` profile and proposed `@gms/storage` package, while applying the permanent-retention rule to **all user-uploaded files in all current and future modules** (`files` and user-uploaded `public` assets). Keep current APIs, authorization, file limits, content checks, hashes, cache versioning and errors. Use current-owner prefixes `auth/` and `partner/`; moving the logo to `master/` belongs to the separately staged api-master cutover. Each owning schema stores metadata in its own `stored_files` table. Use streaming temp-write plus validation and atomic publish. Nginx receives read-only access only for protected internal delivery; owning APIs receive read-write access only to their service scope. Removed/replaced uploads become logically deleted but their bytes and metadata remain forever. System-generated documents and exports retain their type-specific/default TTL lifecycle. Do not configure purge for user-uploaded objects.

The full proposed contract and diagrams are in [the SA bundle](../apps/backend/storage/gms-file-migration/architecture.md); infra research is [revision 3](../infra/services/gms-file-storage/3/security.md). Status is Accepted for implementation after owner approval of SA revision 3. Production host operations, data migration/cutover and deployment remain separately gated.

## Alternatives

1. Keep per-service named volumes: compatible with the existing accepted feature ADRs and survives container recreation, but does not satisfy the target shared abstraction, common protected delivery or consistent metadata/retention.
2. Store bytes in PostgreSQL: rejected; user photo and logo are binary files and the platform requires bytes outside DB.
3. Move directly to S3/Garage: deferred; no customer profile, credentials, external dependency or 4 GB capacity authorization exists.

## Consequences and capacity

No new runtime container or DB pool. Current photo/logo size limits remain 5/10 MiB; other upload limits remain feature-specific. Permanent retention means disk use grows without a product-defined upper bound. Host disk budget, alert threshold, upload admission/fail-closed behavior, ownership, off-host backup target and RPO/RTO must be resolved before rollout. Reject new uploads safely when space is insufficient; never delete any retained upload to make room. Rollout requires verified DB+volume backup, checksum migration, source preservation and a rollback window. Never delete `auth-storage` or `partner-storage` as part of cutover.

## Acceptance and approval

Approval of SA revision 3 covers the documents listed in [the review bundle](../reviews/sa/2026-10-21-gms-file-storage-rev3.md), permanent retention for all user uploads, ADR-0029/0030, GMS spec v1.2, adding `@gms/storage` as an approved proposed package, and implementation TODO items GF-01 through GF-09. It does not authorize production rollout, host operations, deletion of retained files, S3/Garage, or changes to frontend APIs. Those remain gated. Owner approved backend implementation on 2026-10-21; UI deletion hides the item while retaining bytes permanently.

SA revisions 1 and 2 were superseded before approval. Revision 3 applies permanent retention platform-wide to user uploads only. System-generated documents and exports retain their existing lifecycle.
