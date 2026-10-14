# Delivery service index

Source inventory: 2026-10-11; backend-api-partner added 2026-10-14 (BE-CUS-012). Parent serializes this shared index and pipeline updates.
Compare changes with package scripts, Dockerfiles and the infra service index; do not
choose by mtime or pretend new service pipelines are verified merely because a row exists.

| Service | Build source / package | Pipeline | Registry identity after explicit publish | Status |
|---|---|---|---|---|
| frontend | frontend/Dockerfile / frontend | CI + service-images matrix | ghcr.io/<owner>/<project>/frontend:sha-<source SHA>, plus digest | configured; remote run pending |
| backend-api-gateway | backend-api-gateway/Dockerfile / @gem-crm/backend-api-gateway | CI + service-images matrix | ghcr.io/<owner>/<project>/backend-api-gateway:sha-<source SHA>, plus digest | configured; remote run pending |
| backend-api-auth | backend-api-auth/Dockerfile / @gem-crm/backend-api-auth | CI + service-images matrix | ghcr.io/<owner>/<project>/backend-api-auth:sha-<source SHA>, plus digest | configured; remote run pending |
| backend-api-partner | backend-api-partner/Dockerfile / @gem-crm/backend-api-partner | CI + service-images matrix | ghcr.io/<owner>/<project>/backend-api-partner:sha-<source SHA>, plus digest | configured 2026-10-14 (ADR-0018 rev 1, infra bundle backend-api-partner/1); remote run pending |
| postgres | upstream postgres:18.6-alpine | no local app build | upstream image; pin/review through infra | runtime hardening/deployment pending |
| mailpit | upstream axllent/mailpit:v1.29 | none | none | removed 2026-10-12 per [ADR-0015](../adr/0015-remove-forgot-password-and-email.md); no pipeline/variable changes were needed |

Add exact ADR/infra/source/config hashes, action versions, release image digests, run URL,
verification and unresolved gaps when real work runs. Source/Dockerfile/runtime/platform
changes invalidate affected evidence. Cross-workspace source or shared manifests may affect
multiple services; current pipelines deliberately build all four apps.

## backend-api-partner delivery record (BE-CUS-012, 2026-10-14)

Approval: owner 2026-10-14T11:45+07:00 approved ADR-0018 rev 1, SA rev 1 and infra bundle
backend-api-partner/1 ("อนุมัติ customer ทั้งชุด ใช้ค่าแนะนำ ..."); BE-CUS-012 is in
[customer TODO](../task/todo/customer.md). Prepared on branch feat/14-10-26-customer; not
committed, pushed or run remotely.

- CI quality job: unchanged commands. Root `pnpm lint/build/typecheck` run `pnpm -r`, which
  includes the partner workspace (`backend-api-*` glob). Partner `build`/`typecheck` run
  `prisma generate`; its prisma.config.ts uses a local dev URL outside production, so CI
  needs no database secret and connects to nothing.
- CI Compose step: base Compose now requires `PARTNER_SERVICE_TOKEN` (`:?`). The step sets
  a fixed non-secret literal `ci-compose-config-validation-only-not-a-secret` in step env
  for interpolation only; `config --quiet` starts nothing and the value is not a credential.
- Service images: `backend-api-partner` added to both the build-only and publish matrices
  (linux/amd64, max-parallel 1, cache scope f1-backend-api-partner). All four app
  Dockerfiles copy partner's package.json, so every app image is rebuilt; a release set is
  all four images and digests.
- Runtime-only variables (never build args, never read by these workflows):
  `PARTNER_DATABASE_URL` (must include `?schema=partner`), `PARTNER_SERVICE_TOKEN`
  (>= 32 chars, same value in gateway and partner; production rejects the .env.example
  value) and gateway `PARTNER_SERVICE_URL`. Partner listens on 3201 (never published),
  runs as uid 1000 with a read-only root; readiness `GET /health/ready`, liveness
  `GET /health/live`. Its image CMD runs `prisma migrate deploy` before start (backend-owned
  migration ordering; deployment plan must account for it).

Local verification 2026-10-14 (Windows, Docker 29.8.0, Compose v5.5.1):

| Check | Result |
|---|---|
| actionlint 1.7.7 (`rhysd/actionlint@sha256:887a259a5a534f3c4f36cb02dca341673c6089431057242cdc931e9f133147e9`) on both workflows | ci.yml 0 errors; service-images.yml 1 shellcheck SC2016 *info* at the existing "Record deployable image identity" step, identical on the HEAD baseline (intentional literal Markdown backticks in printf format); no new findings |
| `docker compose --env-file <empty> -f docker-compose.yml config --quiet` without token | fails as designed: required PARTNER_SERVICE_TOKEN missing (gateway and partner) |
| Same with the CI literal, base and base+dev files | exit 0 both; services postgres, backend-api-auth, backend-api-partner, backend-api-gateway, frontend |

Not run: pnpm install/lint/build/typecheck, any image build, any GitHub Actions run. No
GitHub variable, secret, environment or package setting was created or changed.
