# Dependencies: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

**No new or changed package** in backend or frontend. The design uses what is installed: Prisma 7 with the `partialIndexes` preview (already enabled in `backend-api-master/prisma/schema.prisma`), `@prisma/adapter-pg`, zod 4, tRPC, NestJS, and `node:crypto` (cursor search hash). The ledger in [tech-stack.md](../../../../adr/tech-stack.md) is unchanged; no manifest or lockfile edit.

| Item | Status | Note |
|---|---|---|
| `@gms/storage` | unchanged, not used | no upload capability; no `files/{module}/` scope |
| Redis / cache / queue / worker / push (SSE, WebSocket) | not introduced | D15: no polling or push; capacity in [architecture](architecture.md#capacity-4-gb-ram--2-vcpu-host) |
| Container / image / network / volume | unchanged | no infra or devops routing |
| `backend-api-auth` | one additive view column (auth migration, integration-owned `backend-api-auth/prisma/**`) | no package change |

Frontend: [approve-center dependencies](../../../frontend/approve-center/dependencies.md) (no new package).
