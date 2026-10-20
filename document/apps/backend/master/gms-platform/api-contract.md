# API contract: master / GMS platform migration

- SA revision: 1, approved-design; see central TODO gates; browser base `/api/master/trpc`; old `/api/trpc` remains until cutover
- TODO GP-MASTER-01..04; existing source contracts: [customer](../../partner/customer/api-contract.md), [vendor](../../partner/vendor/api-contract.md), [company](../../partner/company-profile/api-contract.md), [user-permission mapping](../../auth/user-permission/api-contract.md)

| Router operation family | Typed input/output and validation | Required grant | Compatibility |
|---|---|---|---|
| `customer.list/get/options/nextCode/create/update/delete` | Reuse existing Zod shapes and stable IDs; list `{limit<=200,cursor?,search?,active?}` with bounded total/next cursor; mutations keep id/version/code rules | `CUSTOMER:VIEW/ADD/EDIT/DELETE` exact existing catalog key mapping | Compare with current gateway procedure contracts; no silent field renames |
| `vendor.list/get/options/nextCode/create/update/delete` | Same current shapes, bounded list/search and optimistic errors | `VENDOR:VIEW/ADD/EDIT/DELETE` | Existing ADR-0019 behavior retained |
| `companyProfile.get/options/save` | Existing singleton fields/version; logo handled by separate scoped upload/download contract | Existing `COMPANY`/company-profile action mapping to be verified against catalog | No HTML interpretation of bank details |
| `stoneMaster.<kind>.list/get/create/update/delete`, options | Reuse existing stone kind schemas and code composition behavior; list <=200 | Existing stone menu/action mapping, verify exact keys | Current `stone` schema remains owned by same process |
| `GET/PUT /api/master/v1/company-logo` (later) | Stream/check MIME/size <= current 10 MB, version precondition, metadata only in DB | Company profile VIEW/EDIT | Keep old REST handler until storage cutover/rollback |

Exact procedure names and current enum strings come from `backend-api-gateway/src/trpc/router.ts` and accepted feature contracts; frontend/backend must capture them in a compatibility map before changing code. This table names *families*, not permission strings to insert blindly. All public operations require access JWT/local validation plus current auth view and license. Mutations require CSRF/origin check, no GET mutation. Use tRPC standard error transport with stable domain code/request ID; HTTP 401, 403, 409, 422, 503 where appropriate. Internal `/internal/v1/*` remains service-token-only and unreachable from Nginx; it is not a substitute for user authorization.
