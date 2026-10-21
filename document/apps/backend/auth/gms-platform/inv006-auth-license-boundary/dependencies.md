# Dependencies: auth private license boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Ledger: [tech-stack](../../../../../adr/tech-stack.md)

| Package/service | Status | Purpose | Alternative | 4 GB / 2 vCPU impact |
|---|---|---|---|---|
| Existing NestJS/Prisma/PostgreSQL/`jose` | installed; reuse | Private endpoint, view/session checks, existing signed-license validation | None needed | No process/package added; bounded auth pool <=5 |
| Existing license mock implementation | installed; local/test only | Deterministic v2 decision tests | Remote production integration is separately blocked | No container; `LICENSE_MODE=mock` forbidden in production |
| Dedicated auth-master network + `MASTER_AUTH_SERVICE_TOKEN` | proposed infrastructure/secret contract | Limit endpoint access and caller identity to master | Existing broad default network/shared PARTNER token rejected due wider trust | No new container; infra must calculate network/runtime impact |
| `gms_master_authz_reader` + `MASTER_AUTHZ_DATABASE_URL` | proposed provisioning | Separate read-only role/client SELECTs only `auth.current_authorization`; existing `PARTNER_DATABASE_URL` stays unchanged for partner domain and legacy routes | Shared `f1_user` rejected as it defeats privilege-boundary evidence; narrowing the existing partner client would break live procedures | No process/package; reader pool max 1 within master pool allowance |
| File-backed `master_auth_service_token` Compose secret | proposed; app reader must be implemented | Dedicated 32-byte CSPRNG bearer for auth/master service caller; only path env `MASTER_AUTH_SERVICE_TOKEN_FILE`; no value-in-env fallback | Existing broad partner token rejected; container secret mount alone is not an app reader | No runtime package/process; local Docker Desktop mount permissions require verification |

No library installation, image change, real license-server work, external egress change or new container is proposed. Exact Compose topology/secret injection must be researched by infra and included before owner approval.
