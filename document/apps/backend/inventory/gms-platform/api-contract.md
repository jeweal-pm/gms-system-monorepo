# API contract: inventory / GMS platform migration

- SA revision 1, approved-design; see central TODO gates; no UI revision; base `/api/inventory/v1`
- Status: design candidate until a specific first inventory UI/document type and permission catalog are approved; TODO GP-INV-01..05

| Operation | Input | Output | Rule/limit |
|---|---|---|---|
| `GET /items?cursor&limit&search` | `limit=1..200`, bounded search/cursor | `{items: Item[], nextCursor?: string}` | Exact inventory VIEW grant; <=3 DB round trips |
| `POST /items` | `{sku,baseUnitId,...}` and `Idempotency-Key` | `201 {id,...}` | Exact ADD grant, unique normalized SKU, numeric fields as decimal strings |
| `GET /locations`, `GET /lots` | pagination/filter by item/location | bounded list + cursor | VIEW and location scope |
| `POST /documents` | typed `docType`, `documentDate`, up to 200 lines, `Idempotency-Key` | `201 {id,status:'draft'}` | Validate positive line quantities and owner identifiers |
| `POST /documents/:id/post` | `Idempotency-Key`, optional optimistic version; no arbitrary actor ID | `{id,status:'posted',number,postedAt}` | One transaction, nonnegative balances, append movements and period counter; same key/body returns same result; changed body 409 |
| `GET /balances` | item/location/lot filter; cursor/limit<=200 | decimal-string quantity rows | VIEW and location scope, never unbounded |
| `POST /exports` / `GET /jobs/:id` | selected later; normalized params | 202 job ID/status | **Deferred** until worker/storage and first report contract approved |

All operations require validated JWT, current auth view license/user/session/grants and request ID. Mutations require CSRF/origin and payload cap; create/post require Idempotency-Key (proposed 16–128 printable characters; exact policy before code), stored 24 h. 401 invalid auth, 403 grant/license denied, 409 stock/duplicate/idempotency conflict, 422 validation, 503 critical dependency unavailable. Error JSON `{error:{code,message,requestId,details?}}`; `details` includes safe line indexes/IDs only. Exact item/stock document fields and permission keys remain an **approval gate**; do not implement all endpoints from this candidate alone.
