# Delivery service index

Source inventory: 2026-10-11. Parent serializes this shared index and pipeline updates.
Compare changes with package scripts, Dockerfiles and the infra service index; do not
choose by mtime or pretend new service pipelines are verified merely because a row exists.

| Service | Build source / package | Pipeline | Registry identity after explicit publish | Status |
|---|---|---|---|---|
| frontend | frontend/Dockerfile / frontend | CI + service-images matrix | ghcr.io/<owner>/<project>/frontend:sha-<source SHA>, plus digest | configured; remote run pending |
| backend-api-gateway | backend-api-gateway/Dockerfile / @gem-crm/backend-api-gateway | CI + service-images matrix | ghcr.io/<owner>/<project>/backend-api-gateway:sha-<source SHA>, plus digest | configured; remote run pending |
| backend-api-auth | backend-api-auth/Dockerfile / @gem-crm/backend-api-auth | CI + service-images matrix | ghcr.io/<owner>/<project>/backend-api-auth:sha-<source SHA>, plus digest | configured; remote run pending |
| postgres | upstream postgres:18.6-alpine | no local app build | upstream image; pin/review through infra | runtime hardening/deployment pending |
| mailpit | upstream axllent/mailpit:v1.29 | none | none | removed 2026-10-12 per [ADR-0015](../adr/0015-remove-forgot-password-and-email.md); no pipeline/variable changes were needed |

Add exact ADR/infra/source/config hashes, action versions, release image digests, run URL,
verification and unresolved gaps when real work runs. Source/Dockerfile/runtime/platform
changes invalidate affected evidence. Cross-workspace source or shared manifests may affect
multiple services; current pipelines deliberately build all three apps.
