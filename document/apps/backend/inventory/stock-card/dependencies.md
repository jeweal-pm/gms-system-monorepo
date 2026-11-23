# Backend dependency decisions: inventory / stock-card

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (unchanged by this feature; the integration owner makes no edit)
- Frontend dependencies: [frontend dependencies](../../../frontend/stock-card/dependencies.md) (no new package)

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none new — `backend-api-inventory` reuses installed `hono` 4.13.18, `zod` ^4.4.3, `@prisma/client` / `prisma` 7.10.0 (`$queryRaw`, `$transaction` with `isolationLevel`), `@prisma/adapter-pg` 7.10.0, `pg`, `jose`, `pino`, `vitest` 5.0.3 | installed (no new package) | BE-SC-002/003/004 | existing lockfile; Prisma interactive transactions with `isolationLevel: "RepeatableRead"` and `$queryRaw` are used elsewhere in the service | a query builder or `kysely` was not considered: fixed SQL fragments with bound parameters are enough and match the service | none | [ADR-0056](../../../../adr/0056-stock-card-report-in-inventory-service.md) | pending (owner review of this bundle) | n/a |
| none new — `backend-api-master` reuses its inventory client and saga | installed | BE-SC-005/006 | existing | — | none | ADR-0056 | pending | n/a |
| none new — `backend-api-auth` reuses the catalog and Prisma | installed | BE-SC-007 | existing | — | none | ADR-0056 | pending | n/a |
| Excel export library (e.g. `exceljs`) | **not proposed** | Excel stays unavailable (Q-SC-11, SQ-SC-12) | the project rejected `exceljs` for customer export; no approved library | server CSV / XLSX later with its own SA design | would add CPU/RAM per export | none | n/a | n/a |
| Redis, queue, worker, cache | **not proposed** | none needed: ≤ 2 statements per request, bounded data | — | monthly closing-balance table (Closing Stock feature) if the measurement fails | none | ADR-0056 D12 | n/a | n/a |

New services, workers, queues, caches or replicas: **none**. Approval of this bundle is not installation; there is nothing to install.
