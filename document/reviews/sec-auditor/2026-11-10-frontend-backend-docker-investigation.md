# Security investigation — frontend, backend and Docker

- Date: 2026-11-10 (+07:00)
- Role: sec-auditor (Cloudflare security-audit method)
- Profile requested: broad frontend/backend review, current dependency CVEs, and Dockerfile/image review
- Status: **incomplete**. Static review and current dependency advisory lookup completed; full six-phase audit artifacts, bounded runtime verification, and container image scanning were unavailable.
- Source: commit `26f874bb206aa40324d45a581ebf99f68312ee5c`; worktree has uncommitted changes in `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.gms.dev.yml`. No source, dependency, image or Docker files were changed by this investigation.

## Findings staged for review

| Ticket | Finding | Verdict / owner |
|---|---|---|
| [INV-20261110-001](../../task/investigation/INV-20261110-001-body-parser-compressed-request-crash.md) | `body-parser@2.3.0`, an unauthenticated compressed-request process-crash advisory is reachable through auth JSON parsing | needs_validation / backend |
| [INV-20261110-002](../../task/investigation/INV-20261110-002-compose-crm-default-key.md) | Base Compose has a fixed CRM key fallback on the admin-provisioning path | needs_validation / infra |
| [INV-20261110-003](../../task/investigation/INV-20261110-003-compose-postgres-public-default-credentials.md) | Base Compose publishes PostgreSQL with the known development credential reused by services | needs_validation / infra |
| [INV-20261110-004](../../task/investigation/INV-20261110-004-zod-unbounded-stone-part-order-array.md) | Zod 4.6.5 and an unbounded `partOrder` array may allow memory exhaustion for an authorized writer | needs_validation / backend |
| [INV-20261110-005](../../task/investigation/INV-20261110-005-container-image-refresh-hardening.md) | Container image refresh, dependency pruning, and image CVE scanning | hardening / infra |

All findings remain `pending-review`; no fix was selected or applied. Existing tickets were not duplicated: auth port publication [INV-20261017-007](../../task/investigation/INV-20261017-007-auth-internal-port-published-on-host.md), auth root runtime [INV-20261017-004](../../task/investigation/INV-20261017-004-auth-runtime-runs-as-root.md), raw photo body buffering [INV-20261017-006](../../task/investigation/INV-20261017-006-auth-photo-raw-body-unauthenticated-buffering.md).

## Dependency advisory inventory

`pnpm audit --prod` on 2026-11-10 reported 11 advisories (5 high, 4 moderate, 2 low). A full lockfile audit reported 14 advisories (5 high, 6 moderate, 3 low):

| Package / locked version | Upstream patched version | Review note |
|---|---:|---|
| `body-parser@2.3.0` | 2.4.0 | Source-reachable process-crash candidate; ticket 001 |
| `zod@4.6.5` | 4.6.6 | Runtime schema dependency; one unbounded stone-code array found; ticket 004 |
| `multer@2.4.0` | 2.5.0 | Transitive Nest package; no Multer/FileInterceptor use found in application source, so not reported as app vulnerability |
| `deepmerge-ts@7.1.5` | 8.0.0 | Tool/config path; no attacker-controlled recursive object path found |
| `mysql2@3.15.3` | 3.22.0 / 3.23.1 | Prisma MySQL driver; project datasource is PostgreSQL, no active MySQL client path found |
| `fast-uri@3.1.8` | 3.1.9 | Nested tooling paths; no affected runtime URI sink confirmed |
| `deepmerge@4.3.1` | no compatible fixed version reported by current audit | Nest CLI tooling path; dev-only |
| `qs@6.16.0` | 6.16.1 | Advisory concerns `stringify` comma-array behavior; no project call path found |
| `glob@13.0.6` | 14.0.2 | Nest CLI tooling path; dev-only |
| `minimatch@10.2.6` | 11.0.1 | typescript-eslint tooling path; dev-only |

The audit command reports advisory matches, not ten confirmed exploitable application vulnerabilities. For packages other than the two tickets above, source reachability was not established. Full image-layer CVE status remains unknown.

## Docker and runtime baseline

- Frontend, auth and master use `node:24.22.1-bookworm-slim`; official Node release sources list `24.22.2` as released 2026-10-28. The pinned 24.22.1 was the October 21 security release, so the October security bulletin itself does not establish the app is behind its fix; the newer patch should still be reviewed. See [Node 24.22.2 release](https://nodejs.org/en/blog/release/v24.22.2) and [October 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
- PostgreSQL uses `postgres:18.6-alpine`; upstream currently lists 18.6 as the latest stable PostgreSQL 18 image release. No PostgreSQL minor upgrade is indicated by this review. See [official image tags](https://github.com/docker-library/official-images/blob/master/library/postgres) and [PostgreSQL security information](https://www.postgresql.org/support/security/).
- Nginx is pinned to `nginxinc/nginx-unprivileged:1.30.6-alpine3.24@sha256:e2a8…`; a newer build of the same 1.30.6 Alpine tag was available at review time. This is a digest-refresh check, not a confirmed CVE.
- The app Dockerfiles use one build/runtime stage and install all workspace dependencies; auth/master also keep Prisma migration tooling in runtime. Auth runs as root, already tracked by INV-20261017-004; master runs as UID 1000. `.dockerignore` excludes environment files and storage.
- No local Trivy, Grype or Docker Scout scanner was available, and no SBOM was available. Debian/Alpine package advisories for the actual image digests could not be checked.

## Coverage and limitations

Static source coverage included frontend auth/session, same-origin proxies, client content rendering, redirects, forms/uploads and response headers; backend auth/session/JWT, tRPC authorization, service tokens, validation, uploads/storage, data access and lifecycle; dependency lockfile; Dockerfiles, Compose overlays, `.dockerignore` and CI image workflows. Independent read-only reviewers checked frontend, backend, supply chain/Docker, then separately verified the candidate findings. No actionable frontend source issue was established; frontend deployment headers, TLS, and production ingress remain owner validation gaps. Existing UI security tickets were deduplicated rather than reopened.

No target code, tests, browser checks, live services, Compose processes or image builds were executed. The environment did not provide the complete enforced execution and artifact-promotion controls required for bounded exploit reproduction. The prescribed raw run directory is not ignored by Git, so no full audit raw-output tree was written. This run therefore does not claim complete coverage or a completed full audit; candidate verdicts remain needs-validation and report gaps are explicit.
