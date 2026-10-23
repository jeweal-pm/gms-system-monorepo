# 2026-10-21 GMS gateway runtime and agent workflow

## Runtime and routing

- Removed the stopped `f1-system-backend-api-gateway-1` orphan from the local Compose runtime. The effective services are Nginx, frontend, `backend-api-auth`, `api-master`, and PostgreSQL; no gateway service or container remains in this profile.
- Nginx routes auth and master tRPC directly to their owning services. The legacy `/internal/*` paths remain blocked at Nginx ingress.
- Restarted only `backend-api-auth` to load the latest bind-mounted code. No image rebuild was performed. PostgreSQL, auth-storage, and partner-storage volumes were preserved.
- Local checks: Nginx health, login, and auth session returned 200; legacy photo GET with a request body returned 400, unsupported photo POST returned 405, anonymous public photo GET returned 401, and `/internal/*` through Nginx returned 404.

## Photo access and refresh cookies

- Both public and legacy user-photo routes reject unsupported methods and GET request bodies, then check session, current license, and the requested VIEW/EDIT permission before the raw body parser.
- `gms_access` uses `Path=/`; `gms_refresh` uses `Path=/api/auth/refresh`. Rotation and logout clear each cookie at its matching path.
- No permission roles, grant catalog, or user grant assignments were changed. The route-level access checks prevent unauthorized photo requests from reaching body parsing.
- Auth verification: photo HTTP integration **4/4 passed**; full auth suite **83 passed / 14 skipped**; auth typecheck passed. Master suite **317 passed / 19 skipped**; master typecheck passed. DB-gated tests were skipped because isolated test database URLs were unavailable.
- Both required security roles reviewed the same final photo-route delta manifest `a25d5eb92714a9895df1dcb362c42888947e75dd28e0562f81403484f5adcf9d`; both returned clear. The custom `security-auditor` agent type was unavailable, so its definition was applied by the parent as a read-only fallback.
- [INV-008](../task/investigation/INV-20261021-008-auth-photo-method-body-buffering.md) and [INV-009](../task/investigation/INV-20261021-009-refresh-cookie-path-scope.md) are resolved. [INV-010](../task/investigation/INV-20261021-010-gms-current-boundary-runtime-validation.md) remains `needs-validation` for DB-backed authorization-view and production-ingress evidence.

## File storage and retention

- Added the workspace package `@gms/storage` with an fs driver for streamed writes, size/hash validation, safe service-prefix keys, atomic publish, and protected reads. Auth photos and the company logo use service-owned `stored_files` metadata and storage keys while keeping their existing API behavior and permission checks.
- The on-disk bucket begins at `storage/files/`. The rest of the path varies by service and module, for example `storage/files/auth/user-photo/<YYYY>/<MM>/<uuid>.<ext>` and `storage/files/partner/company-profile/<YYYY>/<MM>/<uuid>.<ext>`; the `partner/` key remains until the separately staged owner-prefix migration. Object keys stored in metadata omit the disk root and bucket directory, such as `auth/user-photo/...` or `partner/company-profile/...`.
- User-uploaded objects are retained permanently, including after replacement, UI removal, or owning-record deletion. Removal hides the object and retains its bytes and metadata; `purge_after` stays null. No automatic cleanup, lifecycle expiry, volume pruning, or retention timer may delete user uploads. Generated documents/exports keep their separate lifecycle rules.
- Local rollout refreshed the frozen-lockfile dev dependency cache and recreated only the owning API containers while preserving the existing auth, partner, and PostgreSQL volumes. The existing logo remained readable through its legacy storage path. It has not yet been copied into `storage/files/`; bounded copy/migration and production storage mounts remain open under [GF-06..08](../task/todo/gms-file-storage-migration.md).
- Package tests passed **23/23**; auth/partner DB retention integration tests passed **2/2 and 1/1** on isolated test PostgreSQL. Both services' migrations and readiness checks passed. Scoped security reviews were advisory with no confirmed vulnerability; remaining storage hardening is tracked in [INV-002](../task/investigation/INV-20261021-002-auth-photo-read-integrity-hardening.md), [INV-003](../task/investigation/INV-20261021-003-gms-storage-path-race-hardening.md), and [INV-005](../task/investigation/INV-20261021-005-partner-db-test-cleanup-safety.md).
- See [ADR-0029](../adr/0029-gms-file-storage-for-auth-photos-and-company-logo.md), [ADR-0030](../adr/0030-permanent-retention-for-user-uploaded-files.md), the [file-storage TODO](../task/todo/gms-file-storage-migration.md), and [local rollout record](../task/done/2026-10-21-gms-file-storage-local-rollout.md).

## Agent and skill delivery rules

- Updated Codex and Claude agent/skill definitions to use one canonical ADR, TODO, or investigation record per decision/root cause; implement immediately after exact approval or direct user fix instruction; avoid repeat approval and reviews of unchanged code; and review only changed source after a fix.
- Updated [remediation workflow](../workflow/remediation.md), [security review workflow](../workflow/security-review.md), [UI delivery workflow](../workflow/ui-delivery.md), and project `AGENTS.md` to match. Mirrored Codex skill/agent definitions were checked against Claude and `agents/` copies.

## Remaining scope

- This verifies the local development runtime only. Production deployment, production ingress/capacity, and the DB-backed auth-view integration remain open; no production rollout is claimed.
