# Backend dependency decisions: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (unchanged by this feature; the integration owner makes no edit)
- Frontend dependencies: none (the existing shared lot dialog and the installed data-fetching layer; see the [TODO](../../../../task/todo/sale-own-stock.md))

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none new: `backend-api-inventory` reuses installed `hono` 4.13.18, `zod` ^4.4.3, `@prisma/client` / `prisma` 7.10.0 (`$queryRaw`, `$transaction`), `@prisma/adapter-pg` 7.10.0, `pg`, `jose`, `pino`, `vitest` 5.0.3 and the `Decimal` imported through `platform/db` | installed | BE-SO-001…006, 008 | the same `$queryRaw` / `Prisma.sql` / `Prisma.join` and `FOR UPDATE` usage as `holds.ts` and `lots.ts`; the DDL is plain PostgreSQL in a Prisma migration (as `lot_key`, `card_key`) | a query builder was not considered: fixed SQL fragments with bound parameters match the service | none | [ADR-0058](../../../../adr/0058-sale-own-stock-from-load-to-stock.md) | pending (the owner instruction authorizes; the parent records the formal fields) | n/a |
| none new: `backend-api-master` (NestJS, Prisma, zod already installed) | installed | BE-SO-006 (`sale/memo-lots`), BE-SO-007 (own-stock Reserve consumption), BE-SO-009 (grant cleanup) | existing lot SQL (`memoLots`) and `lot-allocation` helpers | n/a | none | ADR-0058 | n/a | n/a |
| none: `backend-api-auth`, `frontend` | unchanged | no catalog, no permission, no component library | existing | n/a | none | ADR-0058 | n/a | n/a |
| Redis, queue, worker, cache, scheduler | **not proposed** | the existing 60 s sweep and `sync:redrive` script already cover re-driving; the own-stock step is synchronous and bounded | n/a | n/a | none | ADR-0058 D11 | n/a | n/a |

New services, workers, queues, caches or replicas: **none**. Approval is not installation; there is nothing to install. Shared-manifest edits (`package.json`, lockfile, Dockerfile, Compose, `.github/**`, `tech-stack.md`): **none**. Parent-serialized shared source files touched: `backend-api-inventory/prisma/schema.prisma` (after Stock Value's BE-SV-001), `backend-api-inventory/src/modules/stock/card-kinds.ts` (two rows), `backend-api-inventory/src/app.ts` (route registration).
