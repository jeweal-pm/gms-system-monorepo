# GMS file storage local development rollout

- Date: 2026-10-21
- Scope: local Docker Desktop development only; no production host, migration window, or cutover
- Feature: `gms-file-storage-migration`, TODO revision 3, SA revision 3
- Authorization: owner instruction `infra deploy container รูปแบบใหม่เลย`, relayed by parent as local development scope
- Docker Engine: 25.0.3; Compose: v2.24.6-desktop.1
- Compose files: `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`

## Rollout

The dev Compose overlay bind-mounts the workspace and mounts the existing named storage
volumes at their unchanged service roots. The partner service retains a read-only fallback
for `storage/company-profile/logo`. The SA migration bundle documents that bulk migration
and host storage setup remain separately gated, so this rollout did not copy or rename any
existing file and did not select a production host path.

The new workspace package was absent from the running dev dependency volume before rollout.
Refreshed dependencies with the existing frozen-lockfile install path:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.gms.dev.yml run --rm --no-deps -e CI=true frontend pnpm install --frozen-lockfile --store-dir=/root/.local/share/pnpm/store
```

Then recreated only the two owning API containers, with dependencies left running and named
volumes retained:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.gms.dev.yml up -d --no-deps --force-recreate --wait --wait-timeout 120 backend-api-auth backend-api-partner
```

The `--wait` command reached its 120-second deadline while partner's development TypeScript
watch compilation was starting. The command reported `application not healthy after 2m0s`.
Without restarting or retrying, the subsequent health probe passed; final inspection showed
partner healthy and both service readiness endpoints returned HTTP 200.

## Result and evidence

| Service | Old container | New container | Image ID before / after | Final state |
|---|---|---|---|---|
| backend-api-auth | `b2be2ff9320fb3b5ac18553770fb196eec43e8eca8f4260503bbb1906efc64f2` | `c92908eb04f31d54ebe7c03c5fd436b5922bf71402672618469532566b059b6e` | `sha256:6955a1a4f74d49918910473c134918f7ab35196a751c80316054862441a085e4` | running; `/health/ready` 200 |
| backend-api-partner | `a24ef73d7d52d1c50e96b4e3922a282a3f8c99702ee43d6dd8557f68931750fe` | `fc0f41c3a6ec1ef6b8f666867679b57feef9dd20b782c91661faaa64a7e9607c` | `sha256:6955a1a4f74d49918910473c134918f7ab35196a751c80316054862441a085e4` | healthy; `/health/ready` 200 |

The shared development image was not rebuilt because the dev containers use the workspace
bind mount; its image ID is unchanged. Gateway, frontend, Nginx, and PostgreSQL containers
were not recreated.

Both services applied migration `20261021125000_gms_stored_files`. The auth `stored_files`
table and photo `storage_key` column, and partner `stored_files` table and
`company_profile.logo_storage_key` column are present. Partner profile row count remained 1.
The partner logo route returned HTTP 200, `image/png`, 194,905 bytes through the configured
service-token path. The route verified the current legacy file against stored size, hash,
and image signature; the response body was not saved or displayed.

Named volume identity and creation timestamps were unchanged:

- `f1-system_auth-storage`: `2026-10-20T14:43:35Z`; still mounted at
  `/app/backend-api-auth/storage`.
- `f1-system_partner-storage`: `2026-10-16T08:30:18Z`; still mounted at
  `/app/backend-api-partner/storage`.
- `f1-system_postgres-data`: `2026-10-04T14:47:07Z`; still mounted at
  `/var/lib/postgresql`.

The storage root is `/app/backend-api-partner/storage`; `files/` is the fixed bucket prefix.
The remaining key is module/entity-specific, following
`files/<service>/<module-or-entity>/<YYYY>/<MM>/<uuid>.<ext>`. For example, the current
company-profile module uses `files/partner/company-profile/...`; other modules use their
own key segment. The existing logo remains at the legacy path
`/app/backend-api-partner/storage/company-profile/logo` and is readable. It has **not** been
copied under `files/`. New/replaced uploads use the bucket prefix and the key for their
module. The old bytes remain available for the separately approved bounded migration/copy
workflow.

## Remaining scope

This is a local code rollout only. GF-06 bounded migration tooling, GF-07 production host
path, disk/admission/backup controls, and GF-08 data migration/cutover remain incomplete.
No storage volume was removed, pruned, reset, or replaced; no database was reset; no image
or volume was pruned. Production deployment and capacity are not verified by this report.
