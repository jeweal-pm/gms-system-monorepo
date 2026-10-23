# GMS file storage migration — infra research revision 2

- Date: 2026-10-21; status: research update for SA review only, no runtime config changed
- Scope: permanent retention for auth photos and company logos in the existing GMS fs profile
- SA source: [revision 2](../../../../reviews/sa/2026-10-21-gms-file-storage-rev2.md)
- Prior runtime research: [revision 1](../1/security.md)
- Official Docker sources and local version facts are unchanged from revision 1; Linux production Engine/Compose/kernel versions remain unknown.
- Review-by: 2026-11-20, or sooner if host/storage path, engine, Compose, file profile, adapter or security advisory changes.

## Changed operational requirement

Owner decision 2026-10-21: keep deleted/replaced user photos and company logos indefinitely. This file-retention scope overrides the generic GMS spec §8.4 30-day purge requirement only for these two file classes. Infra must not configure a scheduled cleanup, startup cleanup, worker purge, Docker volume prune, or other lifecycle deletion for their prefixes. Other file classes retain their approved lifecycle policies.

## Capacity and access controls

Current caps are 5 MiB per user photo and 10 MiB per company logo, but version history has no product limit; disk usage is therefore unbounded over time. Before any deployment, measure host filesystem capacity and existing usage, reserve OS/database/backup headroom, select a disk budget and alert threshold, and document an upload admission limit. When available capacity cannot safely complete an upload plus temp/atomic-publish overhead, the owning API must reject the upload without deleting prior/current/history files. A host quota must not silently evict or truncate data. Keep temp data on the same disk and remove only incomplete temporary writes from the current failed operation.

Maintain revision 1 mount boundaries: only `backend-api-auth` and current `backend-api-partner` get narrowly scoped RW access; Nginx gets RO access for protected internal serving; frontend and database have no file mount. Use exact host path `/srv/gms/storage`, pre-created with validated UID/GID/mode and backup policy. The current service prefixes remain `auth/` and `partner/`; moving to `master/` belongs to the separately staged api-master cutover.

Backups must retain both object bytes and metadata tombstones for the agreed retention horizon. Verify an end-to-end restore that preserves old versions and deleted-state access denial. Do not prune old backups or retained object versions under this application scope. Disk capacity, backup horizon, alert threshold and upload rejection threshold require owner/host facts before cutover.

## Checks and status

This revision only updates the operating policy and disk-growth requirements. It does not change images, mounts, networks or Compose. No host capacity, alert, backup/restore or runtime test was available or performed. Reuse Docker mount research from [revision 1](../1/security.md); refresh version-specific evidence before implementation if its review triggers occur.
