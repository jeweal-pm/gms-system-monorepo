# Dependencies: mounted master auth boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21); [tech stack](../../../../../adr/tech-stack.md)

| Package/service | Status | Purpose | Alternative | Capacity impact |
|---|---|---|---|---|
| Existing NestJS, tRPC, Zod, Prisma, `jose` | installed/reuse | Master context, current view and router | No new library | Existing partner cap 384 MiB / 0.25 vCPU; pool <=5 |
| Auth private endpoint + dedicated credential | proposed contract | Auth-owned per-request decision | Broad shared PARTNER token rejected | No process; bounded call latency |
| `gms_master_authz_reader` role + `MASTER_AUTHZ_DATABASE_URL` | proposed | Separate read-only auth view credential/client; existing `PARTNER_DATABASE_URL` and partner Prisma client continue to serve still-live owned-schema procedures | Shared `f1_user` rejected because no privilege isolation; narrowing the partner connection would break live legacy procedures | No process; separate pool max 1 within master pool allowance |
| File-backed `master_auth_service_token` secret | proposed; app reader must be implemented | Dedicated 32-byte service credential, path-only app setting; auth token check is normative across all interfaces | Shared broad `PARTNER_SERVICE_TOKEN` rejected; Docker bridge alone is not an ACL | No process/package; host secret file is outside source/build context |
| Dedicated internal network | proposed; infra review required | Auth-master communication and endpoint isolation | Current separate partner network lacks auth reachability | No new container; aggregate caps remain unchanged |

No package installation, external license-server implementation, image change, queue/cache, or container addition is proposed. Exact secret/network config must be approved after infra research.
