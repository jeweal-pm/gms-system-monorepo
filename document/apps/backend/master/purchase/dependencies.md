# Backend dependency decisions: master / purchase (SA revision 1, approved 2026-11-04)

No new package, service, container, variable, secret or nginx location. The ledger [tech-stack.md](../../../../adr/tech-stack.md) is unchanged (no entry to add). Frontend dependencies: [frontend/purchase/dependencies.md](../../../frontend/purchase/dependencies.md) (none new).

| Need | Reused (installed) | Where |
|---|---|---|
| Persistence, migration | Prisma (ADR-0006), PostgreSQL schema `partner` (ADR-0003, ADR-0027) | `backend-api-master/prisma/**` |
| Document engine, numbering, totals | `TradeDocumentEngine`, `document-numbering.ts`, quotation calculator | `src/trade-document/document-engine.ts`, `src/document-setup/`, `src/quotation/quotation.calculate.ts` |
| Stock moves | `totalPerItem` + the `takeFromMemoStock` row-lock pattern | `src/trade-document/memo-stock.service.ts` (pattern; Purchase owns its SQL in `src/purchase/purchase-stock.ts`) |
| Stock IDs | `issueStockIds` (shared counter, SA-MR-04) | `src/trade-document/memo-receive.service.ts` |
| API, validation | tRPC (ADR-0007/0025), zod 4 | `src/master/router.ts`, `src/purchase/purchase.schemas.ts` |
| Authorization | ADR-0031 master context; auth catalog leaf `purchase` (ADR-0020) | `src/master/authorization.ts` |
| Ids | `uuidV7` from `@gms/storage` (already used by the engine; no file storage) | engine |
| Frontend data | `@tanstack/react-query` + `@trpc/react-query` (ADR-0004) | `frontend/src/features/purchase/**` |

Integration-owned files, serialized through the parent: `backend-api-master/src/app.module.ts` (register `PurchaseService`), `document/task/index.md`, `document/task/frontend-latest.md` and `document/adr/tech-stack.md` (no change needed).
