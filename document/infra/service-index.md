# Infrastructure service index

This explicit registry tracks infra research/configuration coverage; compare it with
actual merged Compose and ADR revisions on every relevant invocation. It is not a watcher.

Source inventory on 2026-10-11: `docker-compose.yml`, overridden for local watch mode by
`docker-compose.dev.yml`. The following are inventory entries, **not security approvals**.
No infrastructure review or container reconfiguration was performed while creating the role.

| Service | Source role/image | Environment coverage | ADR/source reference | Infra bundle/revision | Status | Applied config hash / checks / research date |
|---|---|---|---|---|---|---|
| postgres | PostgreSQL 18.6 Alpine | base + inherited dev | ADR-0001, ADR-0003; compose service postgres | none (network change from backend-api-partner/1) | not-reviewed | none for the service itself. 2026-10-14 BE-CUS-011: added to internal network `partner-db` (plus explicit `default`); recreated once, volume `postgres-data` kept, row counts unchanged |
| mailpit | Mailpit v1.29 | removed from base + dev 2026-10-12 | [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) revision 1 | none | removed | Compose service, `SMTP_*` env and auth `depends_on` removed; dev stack recreated with `--remove-orphans`, auth started without SMTP |
| backend-api-auth | Node/NestJS HTTP, Prisma; shared dev image | base + dev override | ADR-0001, ADR-0006, ADR-0008 | none | not-reviewed | none |
| backend-api-gateway | Node/NestJS HTTP gateway; shared dev image | base + dev override | ADR-0001, ADR-0007, ADR-0018 | none (partner wiring from backend-api-partner/1) | not-reviewed | none for the service itself. 2026-10-14 BE-CUS-011: `PARTNER_SERVICE_URL`, `PARTNER_SERVICE_TOKEN` (`:?` fail-fast), `depends_on` partner, network `partner-api` (plus explicit `default`); recreated once; gateway→partner verified |
| frontend | Node/Next.js; shared dev image | base + dev override | ADR-0004 Frontend | none | not-reviewed | none |
| backend-api-partner | Node 24.11.0 bookworm-slim / NestJS + Prisma 7.10 (adapter-pg); shared dev image in dev | base + dev override | [ADR-0018](../adr/0018-customer-master-partner-service.md) rev 1 (sha256 `a967fe7d…5a05424`) | [services/backend-api-partner/1/security.md](services/backend-api-partner/1/security.md) | implemented, dev-verified (production rollout not done) | BE-CUS-011 2026-10-14 (full hashes in bundle): `docker-compose.yml` 8408246a, `docker-compose.dev.yml` 8bc0e050, `.env.example` 13dcc664; S1–S4, P1–P6, N2–N4, BT-CUS-12 pass on local Docker 29.8.0 / Compose 5.5.1; not run: N5 (`f1_partner`), C1 load, BT-CUS-21 fresh volume, production host facts; deviation `deploy.resources.limits.pids` instead of `pids_limit`; research 2026-10-14, review-by 2027-01-14 |

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
