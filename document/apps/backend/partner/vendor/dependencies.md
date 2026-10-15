# Backend dependency decisions: partner + gateway / vendor

- Source UI revision / SA revision: 2 / 1 (**approved** 2026-10-15)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (integration-owned; SA did not edit it)
- Frontend dependencies: [vendor dependencies.md](../../../frontend/vendor/dependencies.md) (no new packages)

**No new package, no new workspace, no manifest or lockfile change.** Vendor uses only what
`backend-api-partner` and `backend-api-gateway` already install (verified in the customer run 2026-10-14):

| Need | Installed package (locked version) | Workspace |
|---|---|---|
| HTTP controllers | `@nestjs/common`/`core`/`platform-express` 12.1.2, `express` 5.2.1 | partner |
| Persistence / migration / partial index | `@prisma/client`, `@prisma/adapter-pg`, `prisma` 7.10.0 (`partialIndexes` preview already enabled), `pg` 8.23.1 | partner |
| Validation | `zod` 4.6.5 | partner, gateway |
| Logging | `nestjs-pino` 5.3.1 / `pino` 10.x | partner |
| Currency / country names | Node 24 `Intl` (shared reference data) | partner |
| tRPC router, partner calls | `@trpc/server` 11.19.0, global `fetch` | gateway |

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | n/a | — | — | — | none | [ADR-0019](../../../../adr/0019-vendor-master.md) | none | n/a |
| `pg_trgm` extension | not proposed | fast contains-search | PostgreSQL contrib | seq-scan `ILIKE` (bounded data) | index size | — | n/a | n/a |
| `exceljs` | not proposed (Excel disabled, as customer) | — | — | — | — | ADR-0018 | — | not installed |

**Ledger:** no row is required in `tech-stack.md` because nothing is proposed or installed. If the parent wants a
trace row, use: "none new — `vendor` SA rev 1 / UI rev 2 reuses the `backend-api-partner` and gateway stack; no
container/DB-connection change | n/a | ADR-0019".

## Shared-file changes

| File | Change | Owner |
|---|---|---|
| `backend-api-partner/prisma/**` | new models + migration | backend writes; parent serializes (integration-owned) |
| `backend-api-partner/src/app.module.ts` | register vendor controller/service | parent serializes (integration-owned) |
| everything else integration-owned (manifests, lockfile, Dockerfiles, Compose, `.env.example`, `.github/**`, gateway `main.ts`) | **no change** | — |
