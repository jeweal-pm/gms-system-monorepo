# Infrastructure service index

This explicit registry tracks infra research/configuration coverage; compare it with
actual merged Compose and ADR revisions on every relevant invocation. It is not a watcher.

Source inventory on 2026-10-11: `docker-compose.yml`, overridden for local watch mode by
`docker-compose.dev.yml`. The following are inventory entries, **not security approvals**.
No infrastructure review or container reconfiguration was performed while creating the role.

| Service | Source role/image | Environment coverage | ADR/source reference | Infra bundle/revision | Status | Applied config hash / checks / research date |
|---|---|---|---|---|---|---|
| postgres | PostgreSQL 18.6 Alpine | base + inherited dev | ADR-0001, ADR-0003; compose service postgres | none | not-reviewed | none |
| mailpit | Mailpit v1.29 | base + inherited dev; production role needs decision | tech stack; compose service mailpit | none | not-reviewed | none |
| backend-api-auth | Node/NestJS HTTP, Prisma; shared dev image | base + dev override | ADR-0001, ADR-0006, ADR-0008 | none | not-reviewed | none |
| backend-api-gateway | Node/NestJS HTTP gateway; shared dev image | base + dev override | ADR-0001, ADR-0007 | none | not-reviewed | none |
| frontend | Node/Next.js; shared dev image | base + dev override | ADR-0004 Frontend | none | not-reviewed | none |

Add one row per real service and profile-specific helper/job; relate revisions rather
than overwriting history. New/missing rows, accepted ADR changes, image/platform updates,
or material Compose/network/storage drift trigger research through the parent.
Store exact ADR/content hashes and approval when real work is selected. Retain gaps and
`implemented-unverified` until required runtime checks are complete; do not infer success
from a rendered Compose file or an agent handoff.

The parent serializes writes to this shared index, integrating scoped service-bundle
updates from infra. Exact ADR file paths/content hashes are authoritative when legacy
heading IDs disagree. For a researched row retain its review-by date and invalidation
triggers; advisory/image-support evidence is refreshed before each new rollout/setup.
