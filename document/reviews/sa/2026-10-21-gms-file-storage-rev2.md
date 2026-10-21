# SA review — GMS file storage for auth photos and company logo, revision 2

- Date: 2026-10-21 (Asia/Bangkok)
- Status: **superseded before approval by SA revision 3**
- Feature / source UI: `gms-file-storage-migration` / existing approved photo and logo flows
- Proposed ADR: [ADR-0029](../../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md)
- Central TODO: [gms-file-storage-migration revision 2](../../task/todo/gms-file-storage-migration.md)
- Infra research: [gms-file-storage revision 2](../../infra/services/gms-file-storage/2/security.md)
- Approval evidence: none; owner clarified all uploads on 2026-10-21
- Owner decision incorporated: 2026-10-21, “การลบไฟล์ที่ครบกำหนด 30 วัน ไม่ต้องลบ เก็บไว้ตลอด”

## Scope and decision change

Revision 1 proposed a 30-day purge based on GMS spec §8.4. The owner has directed that these files be retained indefinitely. Revision 2 supersedes revision 1 before approval: replaced/removed user photos and company logos are marked logically deleted, and both metadata and bytes remain permanently. No scheduled purge, one-off purge or worker may delete these two file classes. GMS §8.4 remains the default for other file classes.

All other SA revision 1 decisions and documents remain unchanged: only auth user photos and company-profile logo; fs-only `@gms/storage`; preserve existing browser API, permissions, size/type/hash/cache/error behavior; service-owned metadata; `auth/` and current-owner `partner/` prefixes; no S3/Garage, no quotation photo persistence, no new runtime service, and no production rollout. The updated backend document set is under [gms-file-migration](../../apps/backend/storage/gms-file-migration/architecture.md).

Current code evidence and test results remain as recorded in [revision 1 review](2026-10-21-gms-file-storage-rev1.md): auth storage tests 22/22, partner logo tests 33/33, and production/dev image build-context checks passed. These are checks of the existing implementation, not proof of the proposed shared storage behavior.

## Retention and capacity consequences

Each current object remains bounded to 5 MiB (user photo) or 10 MiB (logo), but retained replacements create unbounded cumulative disk growth. GMS host disk capacity is not specified by the 4 GB RAM / 2 vCPU budget. Before deployment, owner/infra must set the available disk budget, alert threshold, backup retention/restore scope, and upload behavior when free space is insufficient. API must fail closed before accepting a write it cannot safely complete; it must never reclaim retained data to make room. No capacity guarantee can be made until host disk facts are measured.

Deleting a user must mark the user's current photo record deleted and retain a tombstone without a cascading FK. The bytes become inaccessible through application APIs but remain in storage and backups. Existing historic versions previously overwritten by legacy code cannot be recovered; migration preserves every file still present in the named volumes at cutover.

## Review bundle and approval coverage

Approval of revision 2 covers ADR-0029, all eight linked backend documents, central TODO revision 2, infra research revision 2, fs-only `@gms/storage` package proposal, permanent retention for only these two image classes, and the exact backend/infra implementation scope in GF-01 through GF-09. The package remains uninstalled until approval. Approval does not authorize production host setup, migration window, container recreation/deployment, deletion of retained data, prefix change to `master/`, S3/Garage, or frontend/API contract changes.

Please approve SA revision 2 as written or identify a decision to amend. If approved, TODO remains blocked on the separate disk-capacity and rollout facts before live migration.
