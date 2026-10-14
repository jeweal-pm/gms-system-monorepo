# Backend dependency decisions: partner + gateway / customer

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (parent integrates the row below; SA did not edit it)
- Frontend dependencies: `document/apps/frontend/customer/dependencies.md` (ui-spec, in progress)

**No new package** (ADR-0018 §4). The new workspace `backend-api-partner` uses only versions
already locked in `pnpm-lock.yaml` (verified 2026-10-14). It adds a new lockfile *importer*
but no new package versions. The root `pnpm-workspace.yaml` glob `backend-api-*` already
includes the new directory, so the workspace file itself does not change.

## Proposed `backend-api-partner/package.json` (integration-owned; parent writes)

```json
{
  "name": "@gem-crm/backend-api-partner",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "prisma generate && nest build",
    "start": "node dist/main.js",
    "typecheck": "prisma generate && tsc --noEmit",
    "lint": "eslint src",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev"
  },
  "dependencies": {
    "@nestjs/common": "12.1.2",
    "@nestjs/core": "12.1.2",
    "@nestjs/platform-express": "12.1.2",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "^16.6.1",
    "express": "5.2.1",
    "nestjs-pino": "5.3.1",
    "pg": "^8.16.3",
    "pino": "^10.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.14",
    "@nestjs/schematics": "11.1.0",
    "@types/express": "^5.0.5",
    "@types/node": "^24.10.0",
    "prisma": "7.10.0",
    "typescript": "~5.9.3"
  }
}
```

`@nestjs/config`, `better-auth`, `argon2`, `jose`, `tsx` are intentionally omitted (not needed).
`tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` are copied from `backend-api-auth`.
`pino-http` comes transitively through `nestjs-pino` as in auth.

| Need | Installed package (locked version) | Workspace |
|---|---|---|
| HTTP service | `@nestjs/common`/`core`/`platform-express` 12.1.2, `express` 5.2.1 | partner (new importer) |
| Persistence / migration | `@prisma/client`, `@prisma/adapter-pg`, `prisma` 7.10.0; `pg` 8.23.1 (`^8.16.3`) | partner |
| `partialIndexes` preview (D-03) | part of `prisma` 7.10.0 (feature since 7.4) | partner |
| Validation | `zod` 4.6.5 (`^4.4.3`) | partner, gateway |
| Logging / redaction | `nestjs-pino` 5.3.1, `pino` 10.x | partner |
| Token compare, UUID check | Node 24 `node:crypto` (`timingSafeEqual`, `createHash`) | partner |
| Currency / country names | Node 24 `Intl.supportedValuesOf`, `Intl.DisplayNames` (official Node images ship full ICU) | partner |
| tRPC router / client to partner | `@trpc/server` 11.19.0, global `fetch` + `AbortSignal.timeout` | gateway (no manifest change) |

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| `country-state-city` (or similar) | rejected (ADR-0018) | State/City dropdowns | — | free-text State/City (chosen) | large data bundle | ADR-0018 | ADR-0018 accepted | not installed |
| `exceljs` | rejected for revision 1 (ADR-0018) | Excel export | — | button disabled | — | ADR-0018 | ADR-0018 accepted | not installed |
| `pg_trgm` extension | not proposed | fast contains-search | PostgreSQL contrib | seq-scan `ILIKE` (chosen, bounded data) | index size | — | n/a | n/a |
| `libphonenumber-js` (backend) | not proposed | per-country phone validation | — | E.164 shape check (reuse user-permission) | — | — | n/a | not installed |

New container cost (0.35 vCPU / 512 MiB) is approved in ADR-0018; see [architecture](architecture.md#capacity-and-rollout).

### Ledger row for the parent to add to `tech-stack.md`

| Package / workspace | Status | Purpose / feature / revision | Official evidence / alternatives | Bundle / host cost | ADR / review bundle | Owner approval evidence | Installed version |
|---|---|---|---|---|---|---|---|
| none new — new workspace `@gem-crm/backend-api-partner` reusing locked NestJS 12.1.2, Prisma 7.10.0 (+ `partialIndexes` preview), `@prisma/adapter-pg` 7.10.0, pg 8.23.1, zod 4.6.5, nestjs-pino 5.3.1, express 5.2.1 | proposed (no new package) | `customer` SA rev 1 / UI rev 1 | Rejected: `country-state-city`, `exceljs`, backend `libphonenumber-js`, `pg_trgm` | +1 container 0.35 vCPU / 512 MiB; +5 DB connections | [ADR-0018](0018-customer-master-partner-service.md), [bundle](../apps/backend/partner/customer/architecture.md) | ADR-0018 accepted 2026-10-14 ("อนุมัติ ADR-0018"); bundle approval none | n/a |

## Shared-file changes (proposed, parent-serialized)

Exact text is in the SA final report to the parent. Summary:

| File | Change |
|---|---|
| `package.json` (root) | `dev` adds `--filter @gem-crm/backend-api-partner`; `db:generate`/`db:migrate` cover both Prisma projects; `docker:dev:install` restarts partner |
| `pnpm-lock.yaml` | new importer `backend-api-partner` via `pnpm install` (no new versions) |
| `backend-api-partner/Dockerfile` (new), `backend-api-auth/Dockerfile`, `backend-api-gateway/Dockerfile`, `frontend/Dockerfile`, `docker/dev.Dockerfile` | `COPY backend-api-partner/package.json …` before `pnpm install --frozen-lockfile`; dev image also runs `pnpm --filter @gem-crm/backend-api-partner db:generate` |
| `docker-compose.yml`, `docker-compose.dev.yml` | new service, gateway env/depends_on, dev volumes (final form from infra bundle) |
| `.env.example` | `PARTNER_DATABASE_URL`, `PARTNER_SERVICE_URL`, `PARTNER_SERVICE_TOKEN` |
| `document/coordination/ownership.yaml` | add `backend-api-partner/prisma/**` to `integration_owned` (mirrors auth) |
