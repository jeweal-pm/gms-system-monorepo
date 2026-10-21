# GMS file storage migration — central TODO

- feature-id: `gms-file-storage-migration`
- revision: 3
- status: in-progress
- source: [GMS platform spec §8 / Appendix B](../../gms-platform-spec.md), existing auth-photo and company-profile contracts
- ui-revision: existing flows; no new UI
- sa-revision: 3 approved for implementation; revisions 1-2 superseded before approval
- approved-revision: 3
- approved-by: project owner
- approved-at: 2026-10-21 12:51 Asia/Bangkok
- approval-evidence: "OK backend เริ่ม ทำได้เลย ... ห้ามลบรูป ไฟล์ ออกจากระบบ แบบอัตโนมัติ ..."; clarified: "ซ่อนจากระบบ แต่เก็บไฟล์จริงถาวร (แนะนำ)". UI deletion is logical hiding; bytes and metadata remain permanently.
- review-bundle: [SA review revision 3](../../reviews/sa/2026-10-21-gms-file-storage-rev3.md)
- backend-bundles: [shared file migration](../../apps/backend/storage/gms-file-migration/architecture.md), [auth photo](../../apps/backend/auth/user-permission/user-photo.md), [company profile](../../apps/backend/partner/company-profile/decisions.md)
- infra: [gms-file-storage revision 3](../../infra/services/gms-file-storage/3/security.md)
- package: `@gms/storage` approved, added as a workspace package with service dependencies and lockfile entry
- retention decision: owner approved indefinite retention for all user-uploaded files/images on 2026-10-21; applies to `files` and user-uploaded `public` objects; UI deletion hides only; generated documents/exports keep existing lifecycle
- rollout prerequisites: host disk budget/alert/upload admission threshold, backup and recovery target remain prerequisites before live cutover

SA revision 3 is approved for backend implementation by the owner's instruction on 2026-10-21. Physical deletion of user-uploaded bytes is prohibited, including after a UI delete; UI delete only hides the asset and retains bytes and metadata. Production host operations, data migration and rollout remain separately gated.

| Done | ID | Owner | Work and acceptance | Prerequisite |
|---|---|---|---|---|
| [x] | GF-01 | parent/SA | Approve exact SA revision 3, ADR-0029/0030 and GMS spec v1.2 | Owner review |
| [x] | GF-02 | parent | Add approved `@gms/storage` fs-only workspace package and lockfile; preserve 4 GB/2 vCPU bounds and no upload lifecycle deletion | GF-01; serialized manifests |
| [x] | GF-03 | backend | Add isolated fs-driver unit/integration tests for streaming, key prefix, atomic write, hashing, failure cleanup, safe delivery and permanent retention | GF-02 |
| [x] | GF-04 | backend | Migrate auth photo metadata/routes to adapter without API/permission/error/version changes; isolated PostgreSQL retention tests pass | GF-02; auth schema bundle |
| [x] | GF-05 | backend | Migrate company-logo metadata/routes to adapter without API/permission/error changes; isolated PostgreSQL retention tests pass | GF-02; partner schema bundle |
| [ ] | GF-06 | backend + infra | Prepare bounded resumable copy tool and stage migration evidence (counts/checksums/source retained) | GF-03..05; approved backup and mount plan |
| [ ] | GF-07 | infra/parent | Configure approved host path and API RW/Nginx RO mounts; verify UID/GID, disk budget, alert/admission thresholds and protected route; prohibit deletion lifecycle for user upload prefixes | application adapter readiness; host disk facts and separate rollout selection |
| [ ] | GF-08 | backend + parent | Stage, verify and cut over only under separately authorized migration window; retain old volumes through rollback window; preserve current and future user-uploaded files indefinitely | all above; backup restore proof; permanent-retention behavior |
| [x] | GF-09 | parent | Run scoped security reviews after final code and record both results against the same source revision; stage advisory findings for owner review | changed code/tests ready |

## Verification and revision history

- Current old behavior verified 2026-10-21: auth 22/22 tests, partner 33/33 tests. These do not verify `@gms/storage` because it is absent.
- SA revision 3 approval recorded 2026-10-21 12:51 Asia/Bangkok; user confirmed UI removal is logical hiding and bytes remain permanently.
- Package implementation: `@gms/storage` at `packages/gms-storage`; `pnpm --filter @gms/storage test` passed 23/23; `typecheck`, `lint`, and `build` passed on 2026-10-21. Tests verify permanent retention, service-prefix isolation, and immutable no-overwrite writes.
- Auth verification on 2026-10-21: 64 passed / 6 unrelated skipped; partner: 287 passed / 15 unrelated skipped. Both Prisma typechecks/client generation, lint, and builds passed. Migrations deployed to the isolated test-only PostgreSQL container on port 55439; auth retention DB tests passed 2/2 and partner retention DB test passed 1/1. Verification blocker [INV-20261021-004](../investigation/INV-20261021-004-gms-file-storage-db-integration-unavailable.md) is resolved.
- Final scoped security reviews against changed-file manifest SHA-256 `8a4270a8e35519c0cc979694211a9e4957daaa2e33086a8a1c1158c6626c566c`: both `sec-auditor` and `security-auditor` returned advisory; no confirmed vulnerability. Production mount/ownership/runtime validation remains outside implementation scope. Hardening findings are staged as [INV-20261021-002](../investigation/INV-20261021-002-auth-photo-read-integrity-hardening.md), [INV-20261021-003](../investigation/INV-20261021-003-gms-storage-path-race-hardening.md), and [INV-20261021-005](../investigation/INV-20261021-005-partner-db-test-cleanup-safety.md). Reviews were read-only; production code and Dockerfile hashes matched the prior review. The latest review covered the final test fixtures; security reviewers did not run application tests.
- Container build verification: auth and partner Dockerfiles both built successfully with the workspace package and generated Prisma clients on 2026-10-21. The two temporary check tags were removed after verification; no service containers were recreated.
- Local development rollout on 2026-10-21: auth and partner containers were recreated against the unchanged named storage and PostgreSQL volumes; both migrations/readiness checks passed, and the existing logo remained readable through the legacy fallback. No new upload was exercised. See [local rollout completion](../done/2026-10-21-gms-file-storage-local-rollout.md). Production host configuration, bounded data migration, and cutover remain open under GF-06..08.
- Company-profile local host bind update on 2026-10-21: existing logo objects were copied to host `storage/` with matching SHA-256 before changing the dev mount; `partner-storage` was retained unchanged as rollback. The dev API now reads/writes through the host bind. Production mount, host ownership, disk budget/alerts, backup and cutover remain open under GF-06…08.
- Revision 1 (2026-10-21): proposed GMS default 30-day purge; superseded before approval by owner retention decision.
- Revision 2 (2026-10-21): user photos/company logos retained indefinitely; superseded before approval after owner clarified all user uploads.
- Revision 3 (2026-10-21): all user-uploaded `files` and `public` assets retained indefinitely; generated docs/exports keep existing lifecycle; approved for implementation. Local development rollout is complete; production host facts, storage controls, backup, migration/cutover remain separately gated.
