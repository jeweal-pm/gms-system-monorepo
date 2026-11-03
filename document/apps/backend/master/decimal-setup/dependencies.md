# Backend dependency decisions: master / decimal-setup (SA revision 1, pending-review)

No new package, service, container, variable or secret. Ledger: [tech-stack.md](../../../../adr/tech-stack.md) (unchanged).

| Need | Reused (installed) | Where |
|---|---|---|
| Persistence, migration | Prisma (ADR-0006), PostgreSQL schema `partner` | `backend-api-master/prisma/**` |
| API | tRPC (ADR-0007/0025), zod | `src/master/router.ts`, `src/decimal-setup/decimal-setup.schemas.ts` |
| Authorization | ADR-0031 master context, auth catalog (ADR-0020) | `src/master/authorization.ts`, `backend-api-auth/src/permission/catalog.ts` |
| Frontend data | `@tanstack/react-query` + `@trpc/react-query` (ADR-0004) | `frontend/src/features/decimal-setup/**` |
| Exact decimal formatting | existing bigint helpers `frontend/src/features/quotation/lib/decimal.ts` | moved/shared via `frontend/src/lib/number-format.ts` |

Integration-owned files touched (serialize through the parent): `backend-api-master/src/app.module.ts` (register
`DecimalSetupService`). `frontend/src/providers/**` is **not** touched (the provider lives in the App Shell).
