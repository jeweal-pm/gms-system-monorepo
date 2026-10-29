# Dependencies: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

No new package, container, image, volume, network, environment variable or secret. The [tech-stack ledger](../../../../adr/tech-stack.md) is unchanged, so infra and devops have nothing to do.

| Uses (installed) | For |
|---|---|
| Prisma (backend-api-master) | 5 new models and the migration |
| zod, tRPC (existing master router) | input schemas and procedures |
| `Prisma.Decimal` + quotation calculator | totals and the dialog amount |
| `@tanstack/react-query` + `masterTrpc` (frontend) | replaces the mock store |

Internal dependencies: Document Setup numbering (`document-numbering.ts`), the vendor and vendor address tables, currency, stone master options, and the auth authorization view (ADR-0031). `@gms/storage` is not used, because there are no photos in this revision.
