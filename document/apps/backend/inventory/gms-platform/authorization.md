# Authorization: inventory / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; [contract](api-contract.md); [ADR-0026](../../../../adr/0026-gms-access-tokens-and-live-authorization.md)

| Operation | Authentication | Enforcement | Denied outcome | TODO |
|---|---|---|---|---|
| Item/location/lot/balance read | JWT signature/issuer/audience/expiry + current auth view | Active account/session, eligible license, exact inventory VIEW grant and allowed location | 401/403/503 | GP-INV-01/02 |
| Create/update master item | Same + CSRF | Exact ADD/EDIT grant; field validation and item version | 403/409/422 | GP-INV-02 |
| Draft/post stock document | Same + CSRF | Exact document ADD/APPROVE or POST grant **pending catalog approval**, allowed source/destination locations, idempotency and nonnegative balance | 403/409/422 | GP-INV-03 |
| Price/cost fields | Same | Separate live `PRICE` grant before serialization/export | Omit/mask | GP-INV-02/03 |
| Jobs/file download later | Same, owner source record | Permission rechecked at enqueue and download; expiring user-bound URL alone is insufficient | 403/404/410 | GP-INV-04/05 |

New inventory menu/action identifiers, approval vs posting distinction and document ownership/location rules require a selected UI/product feature and separate SA approval. No implicit rights from a role name, signed access token or user-provided actor header. Auth view read failure blocks writes. The proposed private online license check uses [configurable offline policy](../../../../spec/gms-license-offline-policy.md): explicit denial is immediate, transient outage fallback defaults to two days, and 0 disables it. The license-server contract and GMS §2 exception remain pending.
