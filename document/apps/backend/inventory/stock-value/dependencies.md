# Backend dependency decisions: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (unchanged by this feature; the integration owner makes no edit)
- Frontend dependencies: the ui-spec `dependencies.md` of `stock-value` (expected: no new package)

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none new: `backend-api-inventory` reuses installed `hono` 4.13.18, `zod` ^4.4.3, `@prisma/client` / `prisma` 7.10.0 (`$queryRaw`, `$transaction` with `isolationLevel`), `@prisma/adapter-pg` 7.10.0, `pg`, `jose`, `pino`, `vitest` 5.0.3 and the `Decimal` the service already imports through `platform/db` | installed (no new package) | BE-SV-001...005 | the same `$queryRaw` / `Prisma.sql` / `RepeatableRead` usage as Stock Card ([dependencies](../stock-card/dependencies.md)); generated columns are plain PostgreSQL DDL in a Prisma migration, as `lot_key` and `card_key` | a query builder (`kysely`) was not considered: fixed SQL fragments with bound parameters match the service | none | [ADR-0057](../../../../adr/0057-stock-value-report-in-inventory-service.md) | pending (parent records the owner's go-ahead) | n/a |
| none: `backend-api-master`, `backend-api-auth` | unchanged | the report needs no master or auth change | existing | n/a | none | ADR-0057 | n/a | n/a |
| Excel export library (e.g. `exceljs`) | **not proposed** | Excel stays unavailable (SQ-SV-16) | the project rejected `exceljs` for customer export; no approved library | server CSV / XLSX later with its own SA design | would add CPU/RAM per export | none | n/a | n/a |
| Redis, queue, worker, cache | **not proposed** | none needed: <= 2 statements per request, bounded data, shared guard | n/a | `item_last_sale` table (BE-SV-101) or a closing-valuation snapshot if PF-SV fails | none | ADR-0057 D12 | n/a | n/a |

New services, workers, queues, caches or replicas: **none**. Approval is not installation; there is nothing to install. Shared-manifest edits (`package.json`, lockfile, Dockerfile, Compose, `.github/**`): none.
