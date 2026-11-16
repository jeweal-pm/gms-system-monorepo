# Authorization: inventory / load-to-stock (SA revision 1, pending-review)

- Contract: [api-contract](api-contract.md); ADRs: [ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md), [ADR-0031](../../../../adr/0031-private-master-authorization-boundary.md), [ADR-0050](../../../../adr/0050-approval-setting-draft-send-to-approve.md) D3, [ADR-0052](../../../../adr/0052-load-to-stock-in-backend-api-inventory.md)
- Catalog: leaf `load-to-stock` already exists in `backend-api-auth/src/permission/catalog.ts` with all nine actions — **no auth catalog change**. Locations are master data read through the internal API; no inventory location grant. `approval-setup` VIEW/EDIT for the inventory settings.

## Authentication chain (every public request, in this order)

1. Access cookie present, ≤ 8 KiB cookie header; JWT verified with jose against the auth JWKS (≤ 2 keys, 10 min cache, unknown-kid refresh ≤ 1/s), issuer, audience, `exp` → else **401** `UNAUTHENTICATED`.
2. Live row from `auth.current_authorization` by `session_id` through role `gms_inventory_authz_reader` (pool 1): session not expired, `account_active`, grants ≤ 576 → else 401/403. DB unavailable → **503** `AUTH_UNAVAILABLE` (fail closed).
3. License: auth endpoint with `INVENTORY_AUTH_SERVICE_TOKEN`; `DENIED` → 403 `LICENSE_DENIED`; `UNAVAILABLE` → 503 (auth applies its offline policy).
4. Mutations: trusted `Origin` (configured `INVENTORY_TRUSTED_ORIGINS`, same list as master) or `Sec-Fetch-Site: same-origin` → else 403 `CSRF_INVALID`. Checked **before** body parsing beyond the size cap.
5. Grant check below, **before** input is used in any query. Super Admin (`account_role = admin`) passes grant checks as in master.

## Matrix

| Operation | Grant | Extra rule |
|---|---|---|
| options, vendors, purchase-lines/search, list, get, photo GET | `load-to-stock:VIEW` | — |
| next-number, create | `load-to-stock:ADD` | — |
| update | `load-to-stock:EDIT` | status/used rules in the service |
| submit | `load-to-stock:ADD` **or** `EDIT` (Q-AS-25) | ON only |
| photo upload, from-purchase-line | `ADD` or `EDIT` | shared photo limiter |
| delete | `load-to-stock:DELETE` | ADR-0045 soft delete; no restore (Q-LS-33) |
| approve, request-revision, reject, approval/pending | `canApprove(user, "load-to-stock")` = today `load-to-stock:APPROVE` **and** VIEW (one helper, ADR-0050 D3) | maker may approve own (Q-AS-31) |
| approval/summary | signed in + licensed | result filtered by `canApprove` |
| approval-settings GET | signed in + licensed | `waitingCount` only with `approval-setup:VIEW` |
| approval-settings PUT | `approval-setup:EDIT` | turn-OFF guard |
| notifications list/read/stream | signed in + licensed (own rows) | `scope=all` filtered by `<leaf>:VIEW` |

PRICE action: not enforced (cost and prices are shown to every VIEW holder, as Purchase). If the owner wants masking later it is an additive response change.

## Data-level rules

- A load's vendor is fixed by its first source; every source must belong to that vendor (checked by master inside the allocation transaction too, so a crafted request cannot mix vendors).
- Photos: a `photoIds` entry must be an inventory `stored_file` with `status = READY` and `source_type = 'load-to-stock.row-photo'`; GET of a photo requires VIEW (no per-document scoping beyond the leaf, as ADR-0048). Photo ids are UUIDv7; there is no listing endpoint.
- `from-purchase-line` is allowed only for a loadable line; master's internal file endpoint serves only files linked to `purchase_line_photo`.
- Actor identity always comes from the verified JWT/session; `X-Actor-User-Id` to master is informational (audit) and master never authorizes on it.

## Service-to-service

| Caller → callee | Credential | Scope |
|---|---|---|
| inventory → master `/internal/v1/inventory/*` | `INVENTORY_MASTER_SERVICE_TOKEN` (file secret, ≥ 32 random bytes) | only that route prefix; master's existing `PARTNER_SERVICE_TOKEN` routes refuse it, and the new guard refuses the partner token |
| inventory → auth license endpoint | `INVENTORY_AUTH_SERVICE_TOKEN` (file secret) | license check only |
| inventory → PostgreSQL | `gms_inventory_app` (schema `inventory` DML; `stock_movement` INSERT/SELECT only), `gms_inventory_migrator` (DDL, one-off job), `gms_inventory_authz_reader` (SELECT on two auth views) | no `partner`/`stone`/`auth` table access |

Denied outcomes never reveal whether a document exists for a user without VIEW (403 before 404).
