# ADR-0030: Permanently retain user-uploaded files

- **Status:** Accepted — SA revision 3; implementation authorized
- **Date:** 2026-10-21
- **Feature / source revision:** `gms-file-storage-migration` / 3
- **Deciders:** project owner
- **Approval evidence:** Owner authorized backend implementation of SA revision 3 on 2026-10-21 and confirmed UI deletion hides the asset while retaining bytes permanently.
- **Related:** [GMS spec v1.2](../gms-platform-spec.md), [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0029](0029-gms-file-storage-for-auth-photos-and-company-logo.md), [SA review](../reviews/sa/2026-10-21-gms-file-storage-rev3.md)

## Context

GMS spec §8.3 already classifies user uploads and product images as permanent, but §8.4 says every stored object is soft-deleted and physically purged after 30 days. The rules conflict. The owner clarified that uploaded images and files must be retained indefinitely, including after replacement or removal. This includes current auth photos/company logo and future user-uploaded files in any module.

## Decision

Propose a platform-wide rule: all user-uploaded assets in `files` and `public` buckets remain in storage indefinitely. Removal, replacement, or deletion of the owning entity changes the asset's logical status/access only; it does not delete bytes or metadata. Set `deleted_at` when access is removed; leave `purge_after` null. No lifecycle rule, cleanup job, worker, volume prune, or host operation may delete these uploaded objects. Preserve the service-owned metadata tombstone without cascading foreign keys.

This applies to user uploads, including profile photos, logos, product images, attachments, scans and future uploaded assets. It does **not** change system-generated `documents` retention by document type or generated `exports` default TTL of 7 days. A file uploaded by a user remains permanent even if its file extension is one commonly used by exports.

## Alternatives

1. Keep 30-day purge for uploads: rejected by owner direction and inconsistent with the permanence in §8.3.
2. Retain bytes but delete metadata: rejected because bytes would become untraceable and backup/restore integrity would be weaker.
3. Retain forever but impose per-module history limits by deleting old versions: rejected; it would violate the stated requirement. Capacity must instead be budgeted and uploads fail closed if available disk cannot safely accept them.

## Consequences and capacity

Cumulative storage grows without a product-defined upper bound. Before production use, measure disk capacity, reserve OS/database/backup headroom, set alerts and an upload admission threshold, select backup retention/restore objectives, and reject new uploads when the write cannot complete safely. Never reclaim retained files to create space. The 4 GB RAM / 2 vCPU budget does not describe disk capacity. No storage capacity guarantee is claimed until host facts are measured.

## Acceptance and approval

Approval of SA revision 3 covers this ADR, the GMS spec v1.2 retention update, ADR-0029's storage implementation for current auth and partner image modules, all eight backend design documents, TODO revision 3, and infra research revision 3. It does not authorize production rollout or host operations. Owner approved backend implementation on 2026-10-21; UI deletion hides the item while retaining bytes permanently. Production host operations and rollout are not approved by this implementation authorization.
