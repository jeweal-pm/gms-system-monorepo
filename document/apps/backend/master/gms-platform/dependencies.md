# Dependencies: master / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; ledger [tech-stack](../../../../adr/tech-stack.md)

| Package/workspace | Status | Purpose / TODO | Evidence/alternative | Host impact |
|---|---|---|---|---|
| `@trpc/server@11.19.0`, gateway | installed; proposed reuse in master | Domain-hosted tRPC, GP-MASTER-01 | [tRPC adapters](https://trpc.io/docs/server/adapters); use existing REST alternatively | Existing master process; measure handler overhead |
| NestJS/Prisma/Zod in `backend-api-master` (`@gem-crm/backend-api-master`) | installed; reuse | Existing business/schema contracts; GMS `api-master` process | Current package manifests/source; owner selected naming-only rename 2026-10-21 | No extra process; no schema/data move |
| JWT verifier (`jose` exact version TBD in master) | proposed | Local auth key verification, GP-MASTER-01 | [jose docs](https://github.com/panva/jose); Node crypto alternative | Bounded JWKS cache/crypto CPU; parent owns manifest |
| `@gms/storage` workspace (source not present) | proposed later | Company logo migration, GP-MASTER-03 | [GMS Appendix A](../../../../gms-platform-spec.md) | fs streaming; S3 SDK only if profile approved |

Workspace folder/package identity is `backend-api-master` / `@gem-crm/backend-api-master`, matching the Compose service `api-master`. The package rename changes only workspace/build/runtime naming; database schemas remain `partner` and `stone`, data and migrations are unchanged, and the legacy gateway contract remains available. New shared package uses `@gms/storage` as proposed in the spec. No package version is approved/installed by this document.
