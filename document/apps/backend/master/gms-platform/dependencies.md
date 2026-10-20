# Dependencies: master / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; ledger [tech-stack](../../../../adr/tech-stack.md)

| Package/workspace | Status | Purpose / TODO | Evidence/alternative | Host impact |
|---|---|---|---|---|
| `@trpc/server@11.19.0`, gateway | installed; proposed reuse in master | Domain-hosted tRPC, GP-MASTER-01 | [tRPC adapters](https://trpc.io/docs/server/adapters); use existing REST alternatively | Existing master process; measure handler overhead |
| NestJS/Prisma/Zod in `backend-api-partner` | installed; reuse | Existing business/schema contracts | Current package manifests/source | No extra process for rename/adaptation |
| JWT verifier (`jose` exact version TBD in master) | proposed | Local auth key verification, GP-MASTER-01 | [jose docs](https://github.com/panva/jose); Node crypto alternative | Bounded JWKS cache/crypto CPU; parent owns manifest |
| `@gms/storage` workspace (source not present) | proposed later | Company logo migration, GP-MASTER-03 | [GMS Appendix A](../../../../gms-platform-spec.md) | fs streaming; S3 SDK only if profile approved |

The existing workspace/importer is `@gem-crm/backend-api-partner`. Process/image naming can become GMS while the internal workspace name remains temporarily unchanged; renaming workspace is a separate serialized manifest/lockfile task with import audit, not proof of data migration. New shared package uses `@gms/storage` as proposed in the spec. No package version is approved/installed by this document.
