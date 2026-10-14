# API contract: auth + gateway / user-permission

- Source UI revision / SA revision: 1 / 1 (**pending-review; proposed, not implemented**)
- Existing shared contracts reused unchanged: CRM `POST /api/v1/users` ([spec 0001](../../../../spec/0001-api-contract.md), ADR-0015), `session.current`, `license.status`, `license.activate` ([license API](../license-integration/api-contract.md))
- Consuming frontend TODO IDs: FE-UP-003, 004, 005, 006, 007, 008, 009, 012, 013, 014 ([central TODO](../../../../task/todo/user-permission.md))
- Diagrams/errors: [sequence](sequence-diagram.md), [errors](error-handling.md), [authorization](authorization.md)

The browser calls only the same-origin `/api/trpc` and `/api/v1` proxies. Timestamps are RFC 3339
UTC strings. IDs are opaque strings (UUID today). Passwords are write-only. Photo bytes travel
only in the base64 `photo` input and the REST download. tRPC errors carry the domain code as
`message` and in `data.domainCode`; validation errors add `data.fieldErrors`
(see [errors](error-handling.md)).

## Shared types

```ts
type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "CANCEL" | "PRICE";
type PermissionKey = `${string}:${PermissionAction}`; // menuKey ":" action, e.g. "vendor:EDIT"

type CatalogNode = {
  key: string;                    // menuKey for leaves, groupKey for groups; /^[a-z0-9-]{1,64}$/
  label: string;                  // English UI label
  actions?: PermissionAction[];   // leaves only: applicable actions (order as columns)
  children?: CatalogNode[];       // groups only; one level deep
};

type Phone = { country: string /* ISO-3166 alpha-2, e.g. "TH" */; e164: string /* ^\+[1-9]\d{6,14}$ */ };

type UserListItem = {
  id: string; name: string; email: string;
  isSuperAdmin: boolean; active: boolean; hasPhoto: boolean; updatedAt: string;
};

type UserDetail = UserListItem & {
  phone: Phone | null;
  locationKeys: string[];               // 0..20 (CRM/admin accounts may have 0)
  permissions: PermissionKey[] | "ALL"; // "ALL" for Super Admin (read-only)
  photoVersion: string | null;          // sha256 prefix; cache-busting query value for the photo URL
  readOnly: boolean;                    // true for Super Admin rows
};

type PhotoInput = { contentType: "image/jpeg" | "image/png"; dataBase64: string /* ≤ 699,052 chars → ≤ 512 KiB */ };
```

## Operations

| Operation | Caller | Input / validation | Output | Permission | Errors | Compatibility |
|---|---|---|---|---|---|---|
| `permission.catalog` query | Browser via gateway | none | `{version: 1, nodes: CatalogNode[], applicableCount: number}` | licensed session | license codes, `USER_SERVICE_UNAVAILABLE` | new |
| `permission.mine` query | Browser via gateway | none | `{isSuperAdmin: boolean, permissions: PermissionKey[] \| "ALL"}` from the trusted context, with no extra auth call | licensed session | license codes | new; for nav filtering and FE-UP-014 |
| `userAdmin.list` query | Browser via gateway | none | `{items: UserListItem[], usage: {used: number, limit: number}}`. Order: Super Admins first, then `createdAt` asc. Hard cap 600 rows. | Super Admin | `SUPER_ADMIN_REQUIRED`, license codes, 503 | new |
| `userAdmin.get` query | Browser via gateway | `{id: string(1..64)}` | `UserDetail` | Super Admin | `USER_NOT_FOUND`, `SUPER_ADMIN_REQUIRED` | new |
| `userAdmin.create` mutation | Browser via gateway | `{email: z.email().max(254)` (trimmed, lowercased)`, password: passwordSchema(4..64, not trimmed), name: trim 1..120, phone: Phone \| null, locationKeys: string[1..20]` (unique, from options)`, active: boolean, permissions: PermissionKey[0..384]` (unique, in catalog)`, photo?: PhotoInput}` strict | `{id: string, updatedAt: string}`; never echoes the password | Super Admin | `VALIDATION_ERROR`, `PASSWORD_POLICY_VIOLATION`, `EMAIL_ALREADY_EXISTS`, `USER_LIMIT_REACHED`, `USER_LICENSE_NOT_ELIGIBLE`, `USER_LICENSE_UNVERIFIABLE`, `PERMISSION_UNKNOWN`, `LOCATION_UNKNOWN`, `PHOTO_INVALID` | new; always creates `role="user"` |
| `userAdmin.update` mutation | Browser via gateway | `{id, expectedUpdatedAt: string, name?, password?, phone?: Phone \| null, locationKeys?, active?, permissions?, photo?: PhotoInput \| null}` strict. Omitted = unchanged. `photo: null` removes it. Sets replace whole sets. **No `email` field.** | `{id, updatedAt}` | Super Admin; target must be `role="user"` | `USER_NOT_FOUND`, `SUPER_ADMIN_READ_ONLY`, `USER_CHANGED`, and the validation codes above | new; password → revoke target sessions; `active:false` → revoke sessions |
| `userAdmin.delete` mutation | Browser via gateway | `{id}` | `{ok: true}` | Super Admin; target `role="user"` and ≠ caller | `USER_NOT_FOUND`, `SUPER_ADMIN_READ_ONLY` | new; idempotent outcome (a second call → `USER_NOT_FOUND`) |
| `userAdmin.locationOptions` query | Browser via gateway | none | `{items: {key: string, label: string}[]}` (≤ 50; v1 = `[{key:"primary",label:"Primary"}]`) | Super Admin | 503 | new; replaced when a Location master exists |
| `GET /api/v1/user-admin/users/:id/photo` | Browser `<img>` via `/api/v1` proxy | path id; optional `?v=<photoVersion>` | `200` image bytes with the stored `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private, max-age=86400` when `v` matches, otherwise `no-cache`; `ETag` | Super Admin | 401, 403, 404 `PHOTO_NOT_FOUND` | new REST (binary is unsuitable for tRPC JSON) |
| `GET /api/v1/user-admin/export.csv` | Browser download via `/api/v1` proxy | none | `200 text/csv; charset=utf-8` with BOM, `Content-Disposition: attachment; filename="users-YYYYMMDD.csv"`. Columns: Email, Name, Role, Active, Phone, Locations, Permissions (`menu:ACTION` joined by `;`, or `ALL`), Created at. Cells starting with `= + - @ \t \r` are prefixed with `'`. | Super Admin | 401, 403, 503 | new REST; not xlsx (no package) |
| `dashboard.shortcutGroups` query | existing | none | **Changed:** non–Super Admins receive only items whose menu has `VIEW`; groups left empty are omitted | licensed | unchanged | behavior change (filtering only; shape unchanged) |
| Better Auth `POST /api/auth/sign-in/email` | existing login | unchanged | **Added outcome:** `403 {code:"ACCOUNT_INACTIVE", message:"บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ"}` when the password is correct and the user is inactive; no session is kept | public | — | additive; frontend login must map it |
| CRM `POST /api/v1/users` | CRM | **unchanged** | unchanged | CRM API key | unchanged | refactored onto shared provisioning; new users get `active=true` and no grants (Super Admin has implicit ALL) |

### Internal auth endpoints (gateway only; cookie forwarded; auth re-validates session + Super Admin)

| Method / path | Purpose |
|---|---|
| `GET /internal/v1/session-context` | **Extended** response: `{session:{user:{id,email,name,role,active}}, license:{...}, authz:{isSuperAdmin:boolean, permissions:string[]}}`. 401 when there is no session **or the user is inactive**. |
| `GET /internal/v1/permission/catalog` | catalog (static) |
| `GET /internal/v1/user-admin/users` · `POST …/users` | list · create |
| `GET/PATCH/DELETE /internal/v1/user-admin/users/:id` | get · update · delete |
| `GET /internal/v1/user-admin/users/:id/photo` | photo bytes |
| `GET /internal/v1/user-admin/location-options` · `GET /internal/v1/user-admin/export.csv` | options · CSV |

Auth errors use the existing envelope `{error:{code, message, fieldErrors?}}`. Gateway maps the
`code` to the tRPC code in [error-handling.md](error-handling.md) and never forwards upstream
`message` text verbatim for 5xx.

## Example (no real personal data)

```ts
// userAdmin.create input
{ email: "user.one@example.com", password: "••••", name: "User One",
  phone: { country: "TH", e164: "+66812345678" }, locationKeys: ["primary"], active: true,
  permissions: ["quotation:VIEW", "quotation:ADD", "vendor:VIEW"],
  photo: { contentType: "image/jpeg", dataBase64: "/9j/4AAQ…" } }
// → { id: "3f6c…", updatedAt: "2026-10-12T03:15:00.000Z" }
```

## Permission catalog v1 (proposal)

Code constant in auth `src/permission/catalog.ts`, `version: 1`. Menu keys reuse the existing
navigation slugs. Pending owner confirmation (Q-UP-13): until then **every leaf has all six
actions**, giving 34 leaves × 6 = **204** applicable cells (the source shows 53, which does not
match). "Home", "Dashboard" and "Setup › User and permission" are not in the catalog:
Home and Dashboard are visible to every licensed user, and User and permission is Super Admin only.

| Group (UI row) | Leaves (`menuKey`) |
|---|---|
| — (top level) | Quotation (`quotation`), Reserve (`reserve`), Sale (`sale`) |
| Company (`company`) | Company Profile (`company-profile`), Bank (`bank`) |
| Partner Master (`partner-master`) | Vendor (`vendor`), Customer (`customer`) |
| Stone Master (`stone-master`) | Stone Group, Stone, Shape, Size, Color, Cutting, Quality, Clarity, Stone Code (`stone-group` … `stone-code`) |
| Purchase Order (`purchase-order-group`) | Purchase Order (`purchase-order`), Purchase (PU) (`purchase`) |
| Memo (`memo`) | Memo In, Memo Return, Memo Out, Memo Out Return |
| Inventory (`inventory`) | Load, Primary, Consignment, Movement, Memo Outstanding |
| Finance (`finance`) | Receivable, Payable |
| Setup (`setup`) | Main Location, Sub Location, Currency, Certificate Type, Labour Type |

Bounds: ≤ 64 leaves, 6 actions, so ≤ 384 grant rows per user. Removing a leaf or action in a
later catalog version ignores stored grants for it and deletes them on the user's next save;
no migration is needed. Action meaning: VIEW opens the menu and lists/reads; ADD creates; EDIT
modifies; DELETE removes; CANCEL cancels/voids a document without deleting it; PRICE sees and
edits price/cost fields. The UI may auto-check related cells, but the server stores exactly
what is sent and checks each action independently.

## Concurrency, idempotency, pagination

- Create: the seat check and insert run under one advisory transaction lock; duplicate email →
  409. Not idempotent; the client blocks double submit.
- Update: optimistic `expectedUpdatedAt` → `USER_CHANGED` 409; the UI reloads `get(id)`.
- List: no pagination. The bound is the seat limit (≤ 500) plus admins, with a server cap of
  600 and `truncated` never expected. Search is client-side.
- The catalog changes only on deploy; the client may cache it for the session.

## Implementation notes (first slice, backend 2026-10-12)

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
