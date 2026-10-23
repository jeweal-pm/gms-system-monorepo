# Dependencies: inventory / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; ledger [tech-stack](../../../../adr/tech-stack.md)

| Package/workspace | Status | Purpose / TODO | Evidence / alternative | Host impact |
|---|---|---|---|---|
| Hono in new `api-inventory` workspace | proposed; version deferred | Small HTTP router, GP-INV-01 | [Hono official docs](https://hono.dev/docs/); NestJS reuse alternative | New 256 MiB process, measured cap required |
| `pg`/Prisma vs query builder in inventory | proposed choice | PG16/18 portable batched stock SQL | Existing Prisma/pg reusable; raw SQL needed for row locks and NULLS NOT DISTINCT | DB pool <=10; choose exact installed/compatible version before approval |
| JWT verifier `jose` | proposed; version deferred | Local EdDSA access JWT verification | [jose docs](https://github.com/panva/jose); Node crypto alternative | Bounded key cache; crypto CPU |
| Redis + BullMQ in worker | proposed **later** | Selected heavy job, GP-INV-04 | [BullMQ docs](https://docs.bullmq.io/); off-hours scheduled job alternative | Redis 192 MiB + worker 512 MiB; no activation without capacity gate |
| `@gms/storage` package, fs driver | proposed **later** | File/export flow, GP-INV-05 | [GMS Appendix A](../../../../gms-platform-spec.md); no direct FS access by domain | Streaming, no whole-file buffer |
| AWS SDK v3 / `@aws-sdk/lib-storage` | proposed only for approved S3 profile | S3 multipart/upload URLs | [AWS SDK v3 docs](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/) | Not installed for default fs profile |

No Hono/worker/storage package currently exists in this checkout. Exact compatible version, package namespace and lockfile change remain pending the parent/owner. Do not infer that proposed images or services are deployable.
