# API contract: auth + gateway / user-permission

- Source UI revision / SA revision: **2 / 2** (implemented 2026-10-15; [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 Accepted 2026-10-15, owner "frontend backend อนุมัติ ADR-0020", which is also the implement instruction). Revision 1 (2026-10-12) is superseded where this file differs.
- Existing shared contracts reused: `session.current` (adds `username`), `license.status`, `license.activate` ([license API](../license-integration/api-contract.md)). Changed: CRM `POST /api/v1/users` ([spec 0001](../../../../spec/0001-api-contract.md)), Better Auth sign-in ([spec 0002](../../../../spec/0002-login-requirements.md))
- Consuming frontend TODO IDs: FE-UP-003…014 and the rev-2 items in the [central TODO](../../../../task/todo/user-permission.md)
- Diagrams/errors: [sequence](sequence-diagram.md), [errors](error-handling.md), [authorization](authorization.md), [database](database-diagram.md)

The browser calls only the same-origin `/api/trpc` and `/api/v1` proxies (and `/api/auth` for sign-in).
Timestamps are RFC 3339 UTC strings. IDs are opaque strings (UUID today). Passwords are write-only.
tRPC errors carry the domain code as `message` and in `data.domainCode`; validation errors add
`data.fieldErrors` (see [errors](error-handling.md)). Read `data.domainCode`, never `message`.

## Shared types (SA revision 2)

```ts
type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "CANCEL" | "APPROVE" | "PRICE" | "PRINT" | "EXCEL";
type PermissionKey = `${string}:${PermissionAction}`; // leaf menuKey ":" action, e.g. "vendor:EDIT"

type CatalogNode = {
  key: string;                          // /^[a-z0-9-]{1,64}$/; leaf keys are unique; container keys are unique among containers
  label: string;                        // English UI label (as in the design)
  kind: "section" | "group" | "leaf";   // section = SETUP…REPORT heading; group = "Master Code"-style parent row
  actions?: PermissionAction[];         // leaves only, in column order; Dashboard = VIEW, APPROVE, PRICE, PRINT, EXCEL
  children?: CatalogNode[];             // sections: leaves and groups; groups: leaves (max depth 3)
};
// NOTE: section "purchase" and leaf "purchase" share a key; key React rows by `${kind}:${key}` or by path.

type Username = string; // trimmed + lowercased; 3..64 of /^[a-z0-9._@+-]+$/; unique; immutable

type Phone = { country: string /* ISO-3166 alpha-2 */; e164: string /* ^\+[1-9]\d{6,14}$ */ };

type UserListItem = {
  id: string; name: string; username: Username;
  isSuperAdmin: boolean; active: boolean; hasPhoto: boolean; updatedAt: string;
};

type UserDetail = UserListItem & {
  phone: Phone | null;
  locationKeys: string[];               // 0..20 (CRM/admin accounts may have 0)
  permissions: PermissionKey[] | "ALL"; // "ALL" for Super Admin = all 9 actions on every leaf
  photoVersion: string | null;          // always null until photo ships
  readOnly: boolean;                    // rev 2 meaning: true for Super Admin = permissions/active/password/delete locked; personal info editable
};
```

No `email` appears in any user-admin input or output. The internal `User.email` value
`<id>@users.invalid` is never returned by user-admin, never editable and never shown
(`session.current.user.email` still carries it for compatibility; do not display it).

## Operations (SA revision 2)

| Operation | Caller | Input / validation | Output | Permission | Errors | Compatibility |
|---|---|---|---|---|---|---|
| Better Auth `POST /api/auth/sign-in/username` | login page | `{username: string, password: string, rememberMe?: boolean}`; username normalized (trim + lowercase) before lookup | `200 {redirect, token, user:{id, name, username, email(internal), role, active, …}}` + session cookie | public; rate limit 5/min/IP | `401 {code:"INVALID_USERNAME_OR_PASSWORD", message, attemptsRemaining}` (also for an impossible username format), `423 {code:"ACCOUNT_LOCKED", message, retryAfterSeconds}`, `403 {code:"ACCOUNT_INACTIVE", message}`, `429` rate limit | **new**; replaces `/sign-in/email`, which now answers `404`. Also disabled: `/update-user`, `/change-email`, `/is-username-available` |
| `permission.catalog` query | Browser via gateway | none | `{version: 2, actions: PermissionAction[9] (column order), nodes: CatalogNode[], applicableCount: 347}` | licensed session | license codes, `USER_SERVICE_UNAVAILABLE` | **changed** (v2 shape: `kind`, nested groups, `actions`) |
| `permission.mine` query | Browser via gateway | none | `{isSuperAdmin: boolean, permissions: PermissionKey[] \| "ALL"}` | licensed session | license codes | unchanged shape; v2 keys |
| `userAdmin.list` query | Browser via gateway | none | `{items: UserListItem[], usage: {used, limit}}`; Super Admins first, then `createdAt` asc; cap 600 | Super Admin | `SUPER_ADMIN_REQUIRED`, license codes, 503 | `email` → `username` |
| `userAdmin.get` query | Browser via gateway | `{id: string(1..64)}` | `UserDetail` | Super Admin | `USER_NOT_FOUND`, `SUPER_ADMIN_REQUIRED` | `email` → `username` |
| `userAdmin.create` mutation | Browser via gateway | strict `{username: Username, password: 4..64 (not trimmed), name: trim 1..120, phone: Phone \| null, locationKeys: string[1..20] (unique, from options), active: boolean, permissions: PermissionKey[0..576] (unique, grantable leaf cells only)}` | `{id, updatedAt}` | Super Admin | `VALIDATION_ERROR` (username → `fieldErrors[{path:"username"}]`), `PASSWORD_POLICY_VIOLATION`, `USERNAME_TAKEN` 409 `[{path:"username",code:"duplicate"}]`, `USER_LIMIT_REACHED`, `USER_LICENSE_NOT_ELIGIBLE`, `USER_LICENSE_UNVERIFIABLE`, `PERMISSION_UNKNOWN`, `LOCATION_UNKNOWN` | `email` → `username`; `EMAIL_ALREADY_EXISTS` → `USERNAME_TAKEN`; always `role="user"` |
| `userAdmin.update` mutation | Browser via gateway | strict `{id, expectedUpdatedAt?: ISO datetime, username?: Username (echo only), password?: 4..64 \| "" ("" = unchanged), name?, phone?: Phone \| null, locationKeys?: string[1..20], active?: boolean, permissions?: PermissionKey[0..576]}`. Omitted = unchanged; sets replace whole sets. | `{id, updatedAt}` | Super Admin | `USER_NOT_FOUND` 404, `USERNAME_IMMUTABLE` 400 `[{path:"username",code:"immutable"}]`, `USER_CHANGED` 409 (only when `expectedUpdatedAt` is sent), `SUPER_ADMIN_LOCKED` 403, validation codes above | **new** (first delivered in rev 2). Regular user: every field; password → revoke target sessions + clear lockout; `active:false` → revoke sessions. **Super Admin target (incl. self): only `name`, `phone`, `locationKeys`** (`active: true` and the unchanged `username` are tolerated); `permissions` (any value), non-empty `password` or `active:false` → `SUPER_ADMIN_LOCKED` |
| `userAdmin.delete` mutation | Browser via gateway | `{id}` | `{ok: true}` | Super Admin; target `role="user"` and ≠ caller | `USER_NOT_FOUND`, `SUPER_ADMIN_LOCKED` 403 | code renamed from `SUPER_ADMIN_READ_ONLY` |
| `userAdmin.locationOptions` query | Browser via gateway | none | `{items: {key, label}[]}` (≤ 50; `[{key:"primary",label:"Primary"}]`) | Super Admin | 503 | unchanged |
| `dashboard.shortcutGroups` query | Home | none | `HomeGroup[]` = `{title, items:{label, slug, href?}[]}[]`; groups/items follow catalog v2 leaf keys (`slug` = menuKey). Super Admin: all. Others: `[]` without `dashboard:VIEW`; otherwise items with `<slug>:VIEW`, empty groups omitted | licensed | unchanged | **changed content** (v2 slugs; Vendor/Customer keep `href` `/setup/vendor`, `/setup/customer`) |
| `session.current` query | AppShell | none | `{user:{id, username, email (internal), name, role?}}` | authenticated | unchanged | additive `username` |
| CRM `POST /api/v1/users` | CRM (`x-api-key`) | strict `{username?: Username, email?: Username (deprecated alias), name, role:"SUPER_ADMIN", password}`; one of username/email required; both present with different normalized values → 400 | `201 {userId, username, email (= username, deprecated echo), createdAt}` | CRM API key | 400 `VALIDATION_ERROR` / `PASSWORD_POLICY_VIOLATION`, 409 `{error:"USERNAME_TAKEN"}` (or `{error:"EMAIL_ALREADY_EXISTS"}` when only the deprecated `email` was sent), 422 `LICENSE_REQUIRED`, 503 | **changed** (ADR-0020 §1) |
| Photo / CSV export REST | — | — | — | — | — | **still deferred** (not in rev 2 delivery) |

### Internal auth endpoints (gateway only; cookie forwarded; auth re-validates session + Super Admin)

| Method / path | Purpose |
|---|---|
| `GET /internal/v1/session-context` | **Extended** response: `{session:{user:{id,username,email,name,role,active}}, license:{...}, authz:{isSuperAdmin:boolean, permissions:string[]}}` (rev 2 adds `username`; `email` is internal; license resolved by username). 401 when there is no session **or the user is inactive**. |
| `GET /internal/v1/permission/catalog` | catalog (static) |
| `GET /internal/v1/user-admin/users` · `POST …/users` | list · create |
| `GET/PATCH/DELETE /internal/v1/user-admin/users/:id` | get · update · delete |
| `GET /internal/v1/user-admin/users/:id/photo` | photo bytes (deferred, not implemented) |
| `GET /internal/v1/user-admin/location-options` · `GET /internal/v1/user-admin/export.csv` | options · CSV (CSV deferred, not implemented) |

Auth errors use the existing envelope `{error:{code, message, fieldErrors?}}`. Gateway maps the
`code` to the tRPC code in [error-handling.md](error-handling.md) and never forwards upstream
`message` text verbatim for 5xx.

## Example (no real personal data)

```ts
// userAdmin.create input (rev 2)
{ username: "user1", password: "••••", name: "User One",
  phone: { country: "TH", e164: "+66812345678" }, locationKeys: ["primary"], active: true,
  permissions: ["dashboard:VIEW", "quotation:VIEW", "quotation:PRINT", "vendor:VIEW"] }
// userAdmin.update on a Super Admin (personal info only)
{ id: "b614…", name: "Super Admin", phone: null, locationKeys: ["primary"] }
// → { id: "3f6c…", updatedAt: "2026-10-12T03:15:00.000Z" }
```

## Permission catalog v2 (implemented; ADR-0020 §3)

Code constant `backend-api-auth/src/permission/catalog.ts`, `version: 2`. Actions (column order):
`VIEW, ADD, EDIT, DELETE, CANCEL, APPROVE, PRICE, PRINT, EXCEL`. Every leaf except Dashboard has all 9.
39 leaves → 5 + 38 × 9 = **347** applicable cells. Sections and groups are never stored as grants
(`setup:VIEW`, `master-code:VIEW` → `PERMISSION_UNKNOWN`).

| Top-level node (`kind`) | Children (`key` "label"; groups in bold) |
|---|---|
| `dashboard` "Dashboard" (leaf: VIEW, APPROVE, PRICE, PRINT, EXCEL) | — |
| `setup` "SETUP" (section) | `company-profile` "Company Profile", `user-and-permission` "User and Permission", `notifications` "Notifications", **`master-code` "Master Code"**: `vendor` "Vendor", `customer` "Customer", `stone-master` "Stone Master", `location-master` "Location Master", `certificate-type` "Certificate Type", `labor-name` "Labor Name", `sale-person` "Sale Person" |
| `pre-sale` "PRE-SALE" (section) | `quotation` "Quotation", `reserve` "Reserve" |
| `memo` "Memo" (section) | `memo-receive` "Memo Receive", `memo-return` "Memo Return", `memo-out` "Memo Out", `memo-out-return` "Memo Out-Return", **`memo-outstanding` "Memo Outstanding"**: `memo-outstanding-vendor` "From Vendor", `memo-outstanding-customer` "From Customer" |
| `purchase` "PURCHASE" (section) | `purchase-order` "Purchase Order (PO)", `purchase` "Purchase", `purchase-outstanding` "Purchase Outstanding" |
| `inventory` "INVENTORY" (section) | `load-to-stock` "Load to Stock", `merge-split` "Merge/Split", `stock-transfer-location` "Stock Transfer Location", `stock-adjustment` "Stock Adjustment", `barcode` "Barcode" |
| `sale-section` "SALE" (section) | `sale` "Sale" |
| `account` "ACCOUNT" (section) | `payable` "Payable", `receivable` "Receivable", **`account-outstanding` "Account Outstanding"**: `outstanding-payable` "Outstanding Payable", `outstanding-receivable` "Outstanding Receivable" |
| `report` "REPORT" (section) | **`stock-movement` "Stock Movement"**: `stock-movement-primary` "Primary Stock", `stock-movement-consignment` "Consignment Stock"; **`closing-stock` "Closing Stock"**: `closing-stock-primary`, `closing-stock-consignment` (same labels); **`sale-report` "Sale Report"**: `sale-report-costing` "Compare with costing", `sale-report-shareholder` "Shareholder Report", `sale-report-commission` "Commission Report" |

Bounds: ≤ 64 leaves × 9 actions = **576** grant rows per user (gateway input cap and session-context
parse cap). The migration deleted every v1 grant (owner decision). Gateway procedures keep
`customer:*` and `vendor:*`; no other gateway procedure uses a menu key. "User and Permission"
grants are stored but user management stays Super Admin only (ADR-0017). The server stores exactly
what is sent; the UI's "Select All"/group rows are client helpers.

## Concurrency, idempotency, pagination

- Create: the seat check and insert run under one advisory transaction lock; duplicate username →
  409 `USERNAME_TAKEN`. Not idempotent; the client blocks double submit.
- Update: optional optimistic `expectedUpdatedAt` (send the `updatedAt` from `get`) → `USER_CHANGED` 409; the UI reloads `get(id)`. Update runs in one transaction (4 s) with a row lock.
- List: no pagination. The bound is the seat limit (≤ 500) plus admins, with a server cap of
  600 and `truncated` never expected. Search is client-side.
- The catalog changes only on deploy; the client may cache it for the session.

## Implementation notes (SA revision 2, backend 2026-10-15)

Delivered: everything in the rev-2 operations table except photo and CSV export. Migration
`backend-api-auth/prisma/migrations/20261015120000_username_permission_v2/`. Verified at runtime on
the dev stack (57/57 scripted checks; see [testing](testing.md#results--sa-revision-2-backend-2026-10-15)).

- Deviation from the shared contract: **Super Admin `photo` is not accepted** (photo storage is still
  deferred, BE-UP-009/012); `photo` on create or update fails strict validation with `VALIDATION_ERROR`
  `[{path:"(root)",code:"unrecognized_keys"}]`. The Photo tile must stay a placeholder.
- `expectedUpdatedAt` is optional (rev 1 had it required) so a client that omits it still saves.
- `password: ""` on update is treated as "unchanged".
- Gateway update timeout 5 s, no retry.
- `ACCOUNT_INACTIVE` (BE-UP-011) is implemented on `/sign-in/username`.

## Implementation notes (first slice, backend 2026-10-12; historical)

Implemented: `permission.catalog`, `permission.mine`, `userAdmin.list`, `userAdmin.get`,
`userAdmin.create`, `userAdmin.delete`, `userAdmin.locationOptions`, the extended session-context
(`authz`, `active`), the `errorFormatter`, and the internal auth routes for these operations. Migration:
`backend-api-auth/prisma/migrations/20261012120000_user_permission/`. Evidence:
[central TODO, Backend progress](../../../../task/todo/user-permission.md). Differences from, and
clarifications to, the contract above:

- **Photo deferred.** `userAdmin.create` input has no `photo` field yet. The schema is strict, so sending
  `photo` returns `BAD_REQUEST` / `VALIDATION_ERROR` with `fieldErrors: [{path:"(root)", code:"unrecognized_keys"}]`.
  `hasPhoto` is always `false` and `photoVersion` is `null` until BE-UP-009/012 ship. The `UserPhoto`
  table exists.
- **Not yet available:** `userAdmin.update`, the photo/CSV REST routes, `ACCOUNT_INACTIVE` on sign-in
  (BE-UP-011) and the VIEW filter on `dashboard.shortcutGroups`. Until BE-UP-011 ships, an inactive
  user can still get a Better Auth session, but every gateway call returns `UNAUTHORIZED`.
- **Error `data` shape.** Every tRPC error now carries `data.domainCode: string | null` and
  `data.fieldErrors: {path, code}[] | null` (≤ 50 entries). `path` is dot-joined (`"email"`, `"phone.e164"`,
  `"(root)"` for unknown keys). `code` is the zod issue code (`too_small`, `invalid_format`,
  `unrecognized_keys`, …) or `duplicate` / `unknown`. Existing procedures get `domainCode` only when their
  message is already a code (`LICENSE_*`), and `null` otherwise (for example `"Authentication required"`).
- **Field errors per code:** `EMAIL_ALREADY_EXISTS` → `[{path:"email",code:"duplicate"}]`;
  `PERMISSION_UNKNOWN` → `[{path:"permissions",code:"unknown"}]`; `LOCATION_UNKNOWN` →
  `[{path:"locationKeys",code:"unknown"}]`. Duplicate entries in `permissions` or `locationKeys` →
  `VALIDATION_ERROR` with `code:"duplicate"`. Password-only failures → `PASSWORD_POLICY_VIOLATION`,
  and gateway applies the same rule to its own input validation.
- **tRPC code mapping:** 400 `BAD_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`,
  422 `UNPROCESSABLE_CONTENT`, 503 `SERVICE_UNAVAILABLE`, other 5xx `INTERNAL_SERVER_ERROR`
  (`domainCode:"INTERNAL_SERVER_ERROR"`). A timeout, network failure or malformed auth response →
  `SERVICE_UNAVAILABLE` / `USER_SERVICE_UNAVAILABLE`. Timeouts: 3.5 s for reads, 6 s for create, 5 s for delete;
  no retry.
- **Seat pre-check order:** create checks the seat cap before the license preflight, so a full deployment
  returns `USER_LIMIT_REACHED` without calling the license server. The cap is still re-checked under the
  advisory lock inside the transaction.
- **License-lookup mapping on create:** an upstream 4xx (non-transient) → 422 `USER_LICENSE_NOT_ELIGIBLE`;
  an outage, malformed token or 5xx → 503 `USER_LICENSE_UNVERIFIABLE`.
- **Auth internal user-admin routes** also require a usable caller license (`LICENSE_*` 403/503) before
  the Super Admin check, as defense in depth for direct calls on port 3101. `GET /internal/v1/permission/catalog`
  requires only an active session; gateway enforces the license.
- **Session-context:** `session.user.active` is always `true` in successful responses, because inactive
  users get 401. For a Super Admin, `authz.permissions` is `[]` and `permission.mine` returns `"ALL"`. Grants
  outside the current catalog are dropped on read.
- `userAdmin.get` returns `permissions` sorted ascending, and `phone` is `null` unless both stored columns
  are set. `userAdmin.list` orders by role (`admin` first), then `createdAt`, then `id`.
- `USER_SEAT_LIMIT` is read once at auth startup (blank/unset → 3; anything other than an integer
  0–500 fails startup). It is not in Compose yet (parent, BE-UP-013).
