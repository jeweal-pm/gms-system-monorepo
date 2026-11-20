# Backend dependency decisions: inventory / sale (SA revision 1, approved 2026-11-18)

**No new package, container, image, secret or DB role.** Ledger: [tech-stack.md](../../../../adr/tech-stack.md) (no entry added; the parent need not update it for this bundle).

| Capability | Provided by (installed) | Notes |
|---|---|---|
| HTTP, streaming SSE, body limits | `hono` 4.13.18, `@hono/node-server` 2.1.7 (inventory, installed) | `streamSSE` already used by the inventory notification stream |
| Validation | `zod` ^4.4.3 (both services) | strict schemas |
| DB | `@prisma/client` / `@prisma/adapter-pg` / `prisma` 7.10.0, `pg` (both) | additive migrations in each owner's migration job |
| Decimal maths | Prisma `Decimal` (decimal.js, bundled) | totals parity with master |
| JWT / JWKS | `jose` 6.2.12 (inventory) | unchanged |
| Uploads | `@gms/storage` workspace package, local-fs driver | scope `files/sale/`; S3 driver proposed only |
| Logging | `pino` | unchanged |
| Master side | NestJS + tRPC + Prisma (installed) | new internal controller routes, no package |

Frontend: no new package ([frontend dependencies](../../../frontend/sale/dependencies.md)).
