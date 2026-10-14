# Authorization: partner + gateway / customer

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Domain rules / API contract: [ADR-0018](../../../../adr/0018-customer-master-partner-service.md) §1–2, [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [API contract](api-contract.md)
- Owner source: ADR-0018 approval 2026-10-14 ("อนุมัติ ADR-0018"); menu key `customer` already in `backend-api-auth/src/permission/catalog.ts` (group `partner-master`, all six actions)

**Trust boundaries**

1. Browser → gateway: identity, license and grants come only from auth's session-context
   (cookie validated by auth). The browser never supplies an actor ID or permissions.
2. Gateway → partner: partner trusts a request **only** when it carries the correct
   `PARTNER_SERVICE_TOKEN`. The token proves "this is the gateway, which already enforced the
   user's permission". `X-Actor-User-Id` is accepted from the gateway for audit columns only;
   it is never used for authorization decisions inside partner.
3. Partner must not be reachable by the browser or host in production (no published port;
   internal network only — infra bundle). The token is defense in depth against other containers.
4. Partner never receives or forwards the user's cookie.

| Operation / resource | Authentication | Allowed | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `customer.list`, `customer.get`, `customer.options` | session + usable license | Super Admin, or grant `customer:VIEW` | gateway `permittedProcedure("customer","VIEW")` | 403 `FORBIDDEN` / `PERMISSION_DENIED` | BE-CUS-008 / BT-CUS-10 |
| `customer.create` | same | Super Admin, or `customer:ADD` | `permittedProcedure("customer","ADD")` | 403 `PERMISSION_DENIED` | BE-CUS-008 / BT-CUS-10 |
| `customer.update` | same | Super Admin, or `customer:EDIT` | `permittedProcedure("customer","EDIT")` | 403 `PERMISSION_DENIED` | BE-CUS-008 / BT-CUS-10 |
| `customer.delete` | same | Super Admin, or `customer:DELETE` | `permittedProcedure("customer","DELETE")` | 403 `PERMISSION_DENIED` | BE-CUS-008 / BT-CUS-10 |
| No session / restricted license | — | — | existing `authenticatedProcedure` / `licensedProcedure` | `UNAUTHORIZED` / `LICENSE_*` (existing UI routing) | existing / BT-CUS-11 |
| Any `/internal/v1/customers**` on partner | service token | gateway only | partner global guard, constant-time compare | 401 envelope; gateway maps to `PARTNER_UNAVAILABLE` | BE-CUS-003 / BT-CUS-12 |
| `/health/live`, `/health/ready` | none | any in-network caller | no data returned | — | BE-CUS-003 |
| Audit columns | — | — | partner sets `createdBy`/`updatedBy` from the header; never from the body (strict schema rejects them) | 400 if header invalid on mutation | BE-CUS-004 / BT-CUS-13 |

Notes

- Actions `CANCEL` and `PRICE` are not used by this page (ADR-0018 §2). Customer has no price
  fields, so no `PRICE`-gated output exists.
- There is no object-level ownership: any user with the grant can act on any customer.
- Grants are read on every request (no cache, ADR-0016), so revocations apply immediately.
- Frontend hiding/disabling of Create/Save/Duplicate/Delete via `permission.mine` is UX only.
- Logs record actor ID, customer ID and action; never customer personal data.
