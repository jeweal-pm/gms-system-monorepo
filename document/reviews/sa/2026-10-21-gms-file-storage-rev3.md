# SA review — GMS storage for all user uploads, revision 3

- Date: 2026-10-21 (Asia/Bangkok)
- Status: **approved for implementation; rollout remains gated**
- Feature: `gms-file-storage-migration` / SA revision 3
- Proposed ADRs: [ADR-0029](../../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md), [ADR-0030](../../adr/0030-permanent-retention-for-user-uploaded-files.md)
- Proposed target spec: [GMS platform spec v1.2](../../gms-platform-spec.md)
- Central TODO: [gms-file-storage-migration revision 3](../../task/todo/gms-file-storage-migration.md)
- Infra research: [gms-file-storage revision 3](../../infra/services/gms-file-storage/3/security.md)
- Approval evidence: Owner authorized backend implementation on 2026-10-21 and confirmed UI deletion means hiding while bytes and metadata remain permanently.
- Owner instruction incorporated: “ไม่มีการลบรูป และ ไฟล์ที่ upload เลยนะ” (2026-10-21)

## Scope and answer to the owner

Revision 2 only covered auth user photos and the company logo. It did **not** guarantee permanent retention for every upload module. Revision 3 expands the proposed platform rule to all user-uploaded files and images, including future modules. The GMS spec's prior 30-day deletion line conflicted with its own “Permanent (soft delete)” upload lifetime, so v1.2 resolves that conflict.

Permanent retention applies to user-uploaded content in `files` and `public` buckets, including images, attachments, scans and future user upload types. Removed/replaced files become inaccessible and are marked deleted, while both bytes and metadata remain indefinitely. No scheduled purge or lifecycle deletion is allowed. System-generated issued documents retain their type-specific policy; generated exports retain the existing default 7-day TTL. These are not user uploads.

Current implementations remain the two previously found modules: auth user photo and partner company logo, each on named Docker volumes. Quotation `ItemPhotoBox` still creates only a browser-local object URL and has no persistent upload. No other backend write-to-disk upload module was found in the inspected checkout. The narrow auth Docker build-context leak was fixed and its investigation ticket resolved.

## Capacity and operational consequences

With no deletion or per-module history limit, total disk use is unbounded by product behavior. The 4 GB RAM / 2 vCPU server spec gives no disk capacity. Before production rollout, owner/infra must measure available disk, reserve OS/database/backup headroom, set alert and upload admission thresholds, select backup retention/restore goals, and ensure an upload is rejected before it can partially replace an existing file when space is insufficient. The system must never reclaim retained files to make room. No capacity guarantee is claimed without host measurements.

## Documents covered by approval

Approval of this exact revision covers ADR-0029 and ADR-0030; GMS spec v1.2; all eight linked backend storage documents; central TODO revision 3; infra research revision 3; and the `@gms/storage` fs-only package proposal for existing and future user uploads. Package implementation is authorized. Production path/mount creation, data migration window and deployment remain separately gated on host facts and rollout authorization.

Approved for implementation. Owner confirmed UI deletion hides the object while retaining bytes and metadata forever. Approval does not authorize production host operations, migration/cutover, or deployment.
