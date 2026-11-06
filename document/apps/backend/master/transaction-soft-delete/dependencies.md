# Dependencies: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

**No new or changed package**, in either backend or frontend. The work uses what is already installed: Prisma with the `partialIndexes` preview feature (already enabled in `backend-api-master/prisma/schema.prisma`), zod, tRPC and NestJS. See the ledger in [tech-stack.md](../../../../adr/tech-stack.md), which this feature leaves unchanged. No manifest or lockfile edits.

No `@gms/storage` change: delete and restore do not touch files (D14). No container, image or service-index change.
