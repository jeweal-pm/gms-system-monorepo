# GMS file storage local development rollout

- Date: 2026-10-21 (+07:00)
- Feature: `gms-file-storage-migration`, TODO revision 3 / SA revision 3
- Scope: local Docker Desktop development only
- Authorization: owner instruction to infra to deploy the new container format
- Detailed evidence: [infra rollout record](../../infra/services/gms-file-storage/3/local-development-rollout.md)

## Completed

- Refreshed the dev dependency volume using the frozen workspace lockfile so both APIs can
  resolve `@gms/storage`.
- Recreated only `backend-api-auth` and `backend-api-partner`; both database migrations
  applied successfully and both readiness endpoints returned HTTP 200. Partner became
  healthy after its watch-mode compilation completed.
- Confirmed the existing auth storage, partner storage and PostgreSQL named volumes retain
  their identities and mounts. Gateway, frontend, Nginx and PostgreSQL were not recreated.
- Confirmed the existing company logo remains accessible through the legacy read path
  (HTTP 200, `image/png`, 194,905 bytes); its response body was not saved or displayed.
- No image or volume was pruned, and no database or storage volume was reset.

## Still open

`storage/files/` is the fixed bucket prefix; the remaining key varies by service and module,
for example `storage/files/partner/company-profile/<YYYY>/<MM>/<uuid>.<ext>`. The current
logo has not been copied under `files/`, and no new upload was exercised. GF-06 bounded
migration tooling, GF-07 production storage controls, and GF-08 data migration/cutover remain
open. This local rollout is not production deployment or capacity verification.
