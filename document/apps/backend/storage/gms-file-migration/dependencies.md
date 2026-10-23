# Dependencies: GMS file storage migration

- Feature / SA revision: `gms-file-storage-migration` / 3
- Status: implementation in progress; SA revision 3 approved 2026-10-21
- Ledger: [tech-stack](../../../../adr/tech-stack.md)

`@gms/storage` is approved for implementation under SA revision 3. Add a workspace package scoped to the `fs` driver and use Node streams and platform built-ins already available. No S3 SDK, Redis, worker, image-processing library, new container or external service. Parent serializes workspace manifests and `pnpm-lock.yaml`. Installation is authorized by owner approval of this exact SA revision and package entry. Verify actual package version/API against GMS Appendix A before coding; return any interface mismatch for review. The adapter must not configure lifecycle deletion for user-uploaded objects in any service, and must not call the package's low-level `delete` operation for committed user uploads. System-generated document/export lifecycle remains separate.

Operational prerequisites: `/srv/gms/storage` capacity, ownership, filesystem and off-host backup/restore target must be decided before production rollout. Local named-volume migration is a separate runtime action and never occurs during package installation or startup.
