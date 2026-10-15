# Authorization: partner + gateway / vendor

- Source UI revision / SA revision: 2 / 1 (**approved** 2026-10-15)
- Domain rules / API contract: [ADR-0019](../../../../adr/0019-vendor-master.md) §2, [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [API contract](api-contract.md)
- Owner source: menu key `vendor` already in `backend-api-auth/src/permission/catalog.ts` (group `partner-master`, all six actions); no catalog or auth change
- Trust boundaries: identical to [customer authorization](../customer/authorization.md) (browser → gateway via auth session-context; gateway → partner via `PARTNER_SERVICE_TOKEN`; `X-Actor-User-Id` for audit only; partner unreachable from browser/host; partner never receives the cookie)

| Operation / resource | Authentication | Allowed | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `vendor.list`, `vendor.get`, `vendor.options` | session + usable license | Super Admin, or grant `vendor:VIEW` | gateway `permittedProcedure("vendor","VIEW")` | 403 `FORBIDDEN` / `PERMISSION_DENIED` | BE-VEN-008 / BT-VEN-11 |
| `vendor.create` | same | Super Admin, or `vendor:ADD` | `permittedProcedure("vendor","ADD")` | 403 `PERMISSION_DENIED` | BE-VEN-008 / BT-VEN-11 |
| `vendor.update` | same | Super Admin, or `vendor:EDIT` | `permittedProcedure("vendor","EDIT")` | 403 `PERMISSION_DENIED` | BE-VEN-008 / BT-VEN-11 |
| `vendor.delete` | same | Super Admin, or `vendor:DELETE` | `permittedProcedure("vendor","DELETE")` | 403 `PERMISSION_DENIED` | BE-VEN-008 / BT-VEN-11 |
| Any `vendor.*` with only `customer:*` grants | same | **not allowed** (grants are per menu key) | exact-grant check | 403 `PERMISSION_DENIED` | BT-VEN-11 |
| No session / restricted license | — | — | existing `authenticatedProcedure` / `licensedProcedure` | `UNAUTHORIZED` / `LICENSE_*` | existing / BT-VEN-12 |
| `/internal/v1/vendors**` on partner | service token | gateway only | existing global `ServiceTokenGuard` (constant-time digest compare) — applies automatically to the new controller | 401 envelope; gateway maps to `PARTNER_UNAVAILABLE` | BE-VEN-004 / BT-VEN-13 |
| Audit columns `created_by`/`updated_by` | — | — | partner sets them from `requireActor` on POST/PUT/DELETE; strict body rejects `createdBy`/`updatedBy` | 400 `(header).x-actor-user-id` / `unrecognized_keys` | BE-VEN-004 / BT-VEN-13 |
| `dashboard.shortcutGroups` Vendor `href` | licensed session | any licensed user (existing) | none new; the target page checks `vendor:VIEW` itself | — | BE-VEN-008 / BT-VEN-19 |

Notes

- Actions `CANCEL` and `PRICE` are not used. Vendor has no price/cost fields, so no `PRICE`-gated output exists.
- No object-level ownership: any user with the grant can act on any vendor.
- Grants are read on every request (no cache), so revocation applies immediately; the frontend invalidates
  `permission.mine` on `PERMISSION_DENIED`.
- Frontend hiding/disabling of Create/Save/Duplicate/Delete is UX only.
- Logs carry actor ID, vendor ID and action; never vendor personal or company data.
