# Authorization: master / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; [contract](api-contract.md); [ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md)

| Operation | Authentication | Service enforcement | Denied result | TODO |
|---|---|---|---|---|
| Customer/vendor/stone list and detail | Verified JWT plus indexed current auth view | Current license/account/session plus exact existing `VIEW` menu grant, location scope if applicable | 401/403/503 | GP-MASTER-01/02 |
| Create/update/delete | Same plus CSRF/origin | Current `ADD`/`EDIT`/`DELETE` grant, validation and optimistic/version rule | 403/409/422 | GP-MASTER-02 |
| Company profile/logo | Same | Exact company grant, size/MIME, version; no object key path trust | 403/409/413/415 | GP-MASTER-03 |
| Price-bearing fields | Same | Separate live `PRICE` grant before serializing rows/exports | Field omitted/masked | GP-MASTER-02 |

The actual permission catalog keys in `backend-api-gateway/src/trpc/router.ts` and `backend-api-auth/src/permission/` are authoritative until an approved mapping is recorded; the API contract's labels are illustrative families. Local grant/session status follows the proposed view's next-request rule. The proposed private online license check uses [configurable offline policy](../../../../spec/gms-license-offline-policy.md): explicit denial is immediate, transient outage fallback defaults to two days, and 0 disables it. No direct write into auth/inventory schemas. A service token authenticates a private caller only and must not grant arbitrary user rights from `X-Actor-User-Id`.
