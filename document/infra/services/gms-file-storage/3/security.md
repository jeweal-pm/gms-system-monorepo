# GMS file storage migration — infra research revision 3

- Date: 2026-10-21; status: research update for SA review only, no runtime config changed
- Scope: permanent retention for all user-uploaded objects in GMS `files` and user-uploaded `public` assets
- SA source: [revision 3](../../../../reviews/sa/2026-10-21-gms-file-storage-rev3.md)
- Prior mount research: [revision 1](../1/security.md); retention/capacity notes: [revision 2](../2/security.md)
- Docker versions/research dates: reuse the matching official-source evidence in revision 1; current Linux production Engine/Compose/kernel and disk facts remain unknown.
- Review-by: 2026-11-20, or sooner if host/storage path, engine, Compose, file profile, adapter or security advisory changes.

## Data-retention scope

Owner directed on 2026-10-21 that uploaded images and files must not be deleted. This revision applies the rule platform-wide to user-uploaded objects in `files` and user-uploaded assets in `public`, across current and future modules. Remove/replace/entity-delete operations may revoke normal access and mark metadata `deleted`; they must not unlink, lifecycle-expire, prune, or purge bytes or metadata. `purge_after` remains null. Do not configure S3 lifecycle expiry, a storage cleanup job, worker purge, host timer or Docker volume prune for uploaded-object prefixes. System-generated `documents` remain under their document-type retention policy; system-generated `exports` retain the existing default seven-day TTL.

## Capacity, admission and recovery

Permanent retention and unlimited replacement history mean cumulative disk use has no product-defined upper bound. The 4 GB RAM / 2 vCPU host profile says nothing about available disk. Before deployment the owner/host operator must measure disk capacity and current usage, reserve OS/database/backup headroom, set warning/critical thresholds and an upload admission threshold, and choose backup retention and restore targets. At the admission threshold, reject new uploads before writing if the new file plus temporary/atomic-publish overhead cannot be safely accommodated. Never free space by deleting an existing user upload. A failed upload may remove only its own incomplete temp object.

Backups and restores must preserve bytes and metadata for deleted/replaced uploads. Restore verification must check hash/count parity and ensure logically deleted objects stay inaccessible through normal APIs. Existing mount boundaries remain those in revision 1: only owning APIs receive narrowly scoped RW mounts; Nginx RO for protected serving; frontend/database no file mount. Per owner instruction on 2026-10-21, new user uploads use `files/{module}/{filename}`; a module may select a safe basename or use a UUIDv7 filename. Adapters allow writes only to their assigned module prefix and reads from that prefix plus their exact legacy service/module prefix. Historical objects remain untouched. Host permissions should enforce equivalent module-level write scope where supported.

## Current facts and checks

The current local named volumes held 0 auth files (4 KiB) and 1 partner file (164 KiB) at initial inspection; the filename/content was not read. These values do not represent production capacity or forecast growth. No production disk budget, alert, admission threshold, backup/restore or runtime check was available. This is a documentation proposal only; no mounts, images, volumes or data were changed.

Reuse official Docker bind-mount and Compose mount research in [infra revision 1](../1/security.md); refresh version-specific sources before implementation if review triggers occur.
