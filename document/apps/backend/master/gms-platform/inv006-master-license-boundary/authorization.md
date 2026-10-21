# Authorization: mounted master boundary

- Source / SA revision: `INV-20261021-006-r1` / 1; approved for implementation (2026-10-21)
- Reuses [master authorization rev1](../authorization.md), [auth contract](../../../auth/gms-platform/inv006-auth-license-boundary/authorization.md).

| Stage | Evidence | Required denial behavior |
|---|---|---|
| JWT | Signature, allowed EdDSA, issuer, audience, expiry, valid `sub` and `sid` | 401; no DB or domain call |
| Mutation CSRF | Trusted exact Origin, required marker, allowed Fetch Metadata | 403 immediately before auth-view/license/domain calls |
| Current local authorization | Separate dedicated non-owner `MASTER_AUTHZ_DATABASE_URL` reader role reads only `auth.current_authorization`; exact sub/sid match, account active, session unexpired. Existing `PARTNER_DATABASE_URL` and partner Prisma client remain unchanged for still-live owned-schema and legacy routes. | 401 for absent/inactive/mismatched/expired; 503 on view/DB failure |
| License | Auth private endpoint validates caller and rechecks live exact user/session, then auth-resolved subject and ADR-0026/28 v2 policy | Known denial 403; unverifiable/unavailable 503; never permit on absent callback |
| Procedure grant | Existing exact user permissions from fresh view; current router-specific action | 403 before service call |

Super-admin behavior and action mapping remain exactly as current staged router/rev1 contract; do not introduce new role semantics. The internal service credential authenticates the calling process only and never grants a user's domain access. The separate auth-reader role has auth-view SELECT only; the existing partner credential remains separate for domain table operations. No permission data is written by master.
