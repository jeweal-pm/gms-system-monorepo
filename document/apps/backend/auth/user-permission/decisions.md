# Owner decisions: user-permission SA revision 2 (revision 1 below)

## Revision 3: Home shortcuts not gated by Dashboard (2026-10-22)

- Feature ID / SA revision: `user-permission` / 3. Changes only `dashboard.shortcutGroups`; no schema, catalog, dependency, container or frontend contract change.
- Status: **approved and implemented** — owner, 2026-10-22: "อนุมัติ user-permission SA rev 3".
- Trigger: user `pun` has VIEW on many menus but not `dashboard:VIEW`, so Home showed "0 groups · 0 shortcuts". Owner, 2026-10-22: "Dashboard คือคนละหน้ากับ Home".

| ID | Decision (rev 3) | Replaces |
|---|---|---|
| D3-01 | `dashboard.shortcutGroups` (`shortcutGroupsFor`, now in auth `src/trpc/auth-trpc.router.ts` after the gateway removal): Super Admin sees every shortcut (unchanged). Everyone else sees each shortcut whose `<slug>:VIEW` they hold, **without** needing `dashboard:VIEW` first. The Dashboard shortcut itself still needs `dashboard:VIEW` (its slug is `dashboard`). Empty groups are omitted (unchanged). Output shape unchanged. | D2-09 (the `dashboard:VIEW` gate) |
| D3-02 | Frontend: when the list is empty (the user has no VIEW on any shortcut menu), Home shows a short message instead of a blank page ("You don't have access to any menu yet. Ask your administrator."). | blank "0 groups · 0 shortcuts" |

Changed: `shortcutGroupsFor` (first in the gateway, ported to auth `src/trpc/auth-trpc.router.ts` when the gateway was removed, 2026-10-23) and its tests (BT-UP-14 / BT-UP2-14 expectations), [api-contract.md](api-contract.md) `dashboard.shortcutGroups` row, [architecture.md](architecture.md) catalog note, ADR-0020's "Dashboard shortcut filter" row (amended note), Home page empty state with a test (auth UT-UP-HS-01…03 in `test/trpc/auth-trpc.router.test.ts`, frontend UT-HOME-03). Security: the gate only hid links to menus the user can already open (every page and API checks its own `<menuKey>:VIEW`), so removing it exposes no new data.

## Revision 2 (2026-10-15, ADR-0020)

- Feature ID / SA revision / source UI revision: `user-permission` / 2 / 2 (screenshots `rev2-01..04` in [source](../../../frontend/user-permission/source/))
- Status: **approved and implemented** — [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) revision 1 Accepted 2026-10-15, owner: "frontend backend อนุมัติ ADR-0020" (an instruction to implement). This bundle revision only records what the ADR decided; it adds no new decision beyond the items marked "backend detail".

| ID | Decision (rev 2) | Replaces |
|---|---|---|
| D2-01 | Username is the only identity: Better Auth `username` plugin, `POST /api/auth/sign-in/username`, `/sign-in/email` disabled. Rule: trim, lowercase, 3–64 of `a-z 0-9 . _ - @ +`, unique, immutable. Not validated as an email. | C-05 R (username = email) |
| D2-02 | `User.email` = internal `<id>@users.invalid`, never shown/editable; `/change-email` and `/update-user` disabled (backend detail: also `/is-username-available`, to avoid an unauthenticated enumeration probe). | — |
| D2-03 | Migration: `username = lower(trim(email))`, then email → internal value; existing users sign in with their old email text. | — |
| D2-04 | License subject = username (sent in the license server's existing `email` field); mock scenarios match the whole username (`license-expired`) or the legacy local part. | ADR-0013 subject |
| D2-05 | Catalog v2: 9 actions, 39 leaves (Dashboard 5 actions), 347 cells; sections/groups not stored; all v1 grants deleted; Super Admin = all 9. | C-07 catalog v1, Q-UP-13 |
| D2-06 | Super Admin rows: personal info (name, phone, locations) editable; permissions, active, password (Profile only) and delete locked → `SUPER_ADMIN_LOCKED`. Photo stays deferred. | Q-UP-14 "Super Admin read-only" |
| D2-07 | CRM accepts `username`; `email` accepted as a deprecated alias; both different → 400. Backend detail: duplicate → `USERNAME_TAKEN`, or the old `EMAIL_ALREADY_EXISTS` when only `email` was sent; response adds `username` and keeps `email` as an echo of the username. | ADR-0015 CRM body |
| D2-08 | Backend detail: `userAdmin.update.expectedUpdatedAt` optional; `password: ""` = unchanged; impossible-format usernames at sign-in answer the same 401 as a wrong password and count toward the lockout. | rev 1 update contract |
| D2-09 | Home shortcuts: v2 keys; non–Super Admins need `dashboard:VIEW`, then `<slug>:VIEW` per item. | C-07 shortcut filter |

Follow-ups owned outside backend: notify the CRM team (send `username`) and the license-server team (accept a non-email subject; rename the field) before connecting a real license server (ADR-0020 consequences).

---

# Owner decisions: user-permission SA revision 1

- Feature ID / SA revision / source UI revision: `user-permission` / 1 / 1 (UI approved 2026-10-12)
- Status: **pending-review** (SA bundle not approved; no backend code, migration or install authorized)
- Owner input used: 2026-10-12 "ตอบคำถาม หน้า user permission จะเป็นหนึ่งใน feature หลักเฉยๆที่สามารถ ให้ super admin นั้นสามารถ มา set permission ของ user ได้ว่า user สามารถ VIEW ADD EDIT DELETE  CANCEL Price frontend backend ทำ หน้า user permission ให้หน่อย"
- Conflicts source: [open-questions.md](../../../frontend/user-permission/open-questions.md)
- Bundle: [architecture](architecture.md), [API](api-contract.md), [authorization](authorization.md), [sequence](sequence-diagram.md), [database](database-diagram.md), [errors](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [ADR-0017](../../../../adr/0017-super-admin-managed-users.md)

Each conflict has one **recommended** option (R) that keeps scope to what the approved UI
revision 1 needs for Super Admin permission management. Approving the bundle "as recommended"
approves every R below. To choose an alternative, name the conflict and letter
(for example "C-06 = B"); that creates SA revision 2 for the affected items only.

## Conflict resolutions

| ID | Recommended (R) | Alternatives | Why R |
|---|---|---|---|
| C-01 In-app creation vs CRM-only | **A. Coexist with separate roles.** CRM keeps `POST /api/v1/users` unchanged and remains the only way to create a **Super Admin**. Super Admin creates **regular users** (`role = "user"`) on this page. Both paths call one shared auth provisioning routine. | B. Page only edits users that CRM created; hide Create/Delete (smallest backend, but contradicts approved UI S1–S5). C. Page replaces CRM (breaking change to the CRM contract; rejected). | Matches the approved UI, leaves the CRM contract and ADR-0015 unchanged, and a single routine prevents the two paths from drifting apart. |
| C-02 License preflight | **A. Same preflight as CRM** (`LicenseService.lookupForProvisioning`): `pending`, or a verified usable `active` license, allows creation. `none`, inactive, malformed or outage creates nothing. A target license failure returns `USER_LICENSE_NOT_ELIGIBLE` (422) or `USER_LICENSE_UNVERIFIABLE` (503). These codes are deliberately distinct from the caller's own `LICENSE_*` codes, so the frontend does not redirect the Super Admin to the activation page. | B. Create without a license and let the user activate later (violates ADR-0013, QL3 and AC-L12; rejected). | ADR-0013 and QL3 are accepted. "1 email = 1 license" remains the real gate. |
| C-03 "N of 3 users, Super Admin not counted" | **A. Local seat cap from deployment config.** Auth reads `USER_SEAT_LIMIT` (integer 0–500; default **3** if unset). `used` = count of `role = "user"` accounts, **including inactive ones**. Super Admins (`role = "admin"`) are excluded. Server enforces it under an advisory lock. The license requirement for every account, Super Admin included, is unchanged. | B. Count licenses from license-server `GET /v1/licenses` (needs a new client method and the deferred `license.list`; fails during outage). C. No cap; show only a count (the drawer text would then be wrong). | The cap and the license are independent. The cap needs no upstream call and works during a license-server outage. Counting inactive users stops a deactivate-and-recreate loop from bypassing the cap. |
| C-04 Admin-set password | **A. Initial password on create plus admin reset on edit.** Policy 4–64 (`passwordSchema`), Argon2id, never returned or logged. A blank password on edit keeps the current one. A reset revokes all of the target's sessions and clears its login lockout. Super Admin's own password changes only through Profile (ADR-0011). This closes the ADR-0015 / tech-stack open item "admin reset tool". | B. Initial password only, no reset (users who forget a password still have no recovery). C. No password on the page; CRM only (contradicts the approved UI). | The UI already shows a Password field, and the reset closes a known pre-production gap without email or a new dependency. |
| C-05 Username vs immutable email | **A. "Username" is the sign-in email** (`auth.User.email`): `z.email()`, max 254, trimmed and lowercased, unique. **Read-only after creation** for every account (QL2: every account holds a license). | B. Add a separate username login (Better Auth username plugin). This is a new identifier that the license does not bind, plus a new plugin; rejected. | The license binds to the email. Keeping the "Username" label is a UI copy choice; the value must be an email. |
| C-06 Delete vs QL1 | **A. Hard-delete the local account only.** Cascade: sessions, credential account, license cache, activation lockout, permissions, locations, photo. `LoginAttempt` rows are kept with `user_id = NULL`. Super Admin and self cannot be deleted. The license server is **not** called; QL1 (unused license time) stays external policy. Recreating the same email later goes through the normal preflight. Delete frees a seat. | B. Soft delete (`deletedAt`). Needs a partial unique email index and excluded-row filters everywhere; useful once business documents reference users. C. No delete; deactivate only. | No business table references users yet, so hard delete is safe and minimal. Revisit with B when the first domain table stores `createdBy`. |
| C-07 No permission model | **A. Per-user grants on a code-defined catalog, enforced now.** Table `auth.UserPermission(userId, menuKey, action)`. Auth adds `{isSuperAdmin, permissions[]}` to the existing internal session context. Gateway adds `superAdminProcedure` and `permittedProcedure(menuKey, action)`. Super Admin has implicit all permissions; this bypass does **not** cover license checks. Every future domain procedure must declare its permission, and price fields are returned only with `PRICE`. Existing `dashboard.shortcutGroups` is filtered by `VIEW`. See [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md). | B. Store only, no enforcement (permissions would be cosmetic; rejected for security). C. Role/group-based RBAC (more schema and UI than the owner asked for; per-user was requested). | Delivers the owner's stated purpose with one table and one middleware, without a new service. |
| C-08 New profile fields | **A.** `User.active` (default true), `phone_e164` + `phone_country` (nullable; server checks E.164 shape only), `auth.UserLocation` keys (1–20 per user, chosen from a **static option list** until a Location master exists, with no data scoping), `auth.UserPhoto` **stored in PostgreSQL** as `bytea`. Only JPEG/PNG, at most 512 KB after the client resizes it to 512×512 or smaller; magic bytes checked. No new container or volume, so infra is not triggered. | Photo: B. File system named volume on auth (infra bundle, backup and permission work); C. MinIO/object store container (RAM/CPU cost; rejected). Location: D. Defer the Location field until a Location master service exists; E. Build Main/Sub Location masters now (out of scope). | Few users, so a capped `bytea` is bounded (worst case 500 × 512 KB ≈ 250 MB on disk), is backed up with the database and is deleted transactionally. Static locations unblock the required UI field without inventing a service. |
| C-09 Password minimum | No conflict. Server reuses `passwordSchema` 4–64. The UI must enforce max 64. | — | — |

## SA answers to blocking UI questions (owner may override)

| Question | SA proposal in this revision |
|---|---|
| Q-UP-01 required fields | Server: email, name, password (create only), ≥1 location required. Phone nullable at the server, because CRM-created accounts have none; whether the page marks it required is a UI rule. |
| Q-UP-05 limit | C-03 R: `USER_SEAT_LIMIT` (default 3); inactive users count; server rejects with `USER_LIMIT_REACHED`; UI disables Create when `used >= limit`. |
| Q-UP-06 | C-01/C-02 R |
| Q-UP-07 | C-04 R. Sessions are revoked on reset. The show/hide toggle is a UI choice. |
| Q-UP-08 | C-05 R |
| Q-UP-10 | C-08 R: static options, initially `primary` only; no data scoping |
| Q-UP-11 | JPEG/PNG; client resizes to at most 512×512 and re-encodes (strips EXIF/GPS) with canvas, no library; server cap 512 KB; remove supported; shown only on this page in revision 1 |
| Q-UP-12 | Active off: sign-in is refused after a correct password (`ACCOUNT_INACTIVE`), all sessions are revoked immediately, the user still counts toward the cap, and the license is untouched |
| Q-UP-13 | Catalog v1 proposal in [api-contract.md](api-contract.md#permission-catalog-v1-proposal): 34 menu leaves × 6 actions. The source's "53" cannot be reproduced and needs the owner's list. CANCEL = cancel/void a document; PRICE = see/edit price and cost fields. No implied rules are stored or enforced. |
| Q-UP-14 | Edit mode is supported (UI copy is a frontend choice). Editable: name, password (reset), phone, locations, active, permissions, photo. Email read-only. Super Admin rows are read-only on this page. |
| Q-UP-15 | C-06 R; the trigger location is a UI choice |
| Q-UP-16 | Print: client `window.print()` of the current form (no backend). Excel: server CSV export (UTF-8 BOM, opens in Excel). Refresh: refetch. Duplicate: client only. |
| Q-UP-20 | Super Admin only (owner answer); enforced in gateway and auth |

## Questions that genuinely need the owner

1. **Seat limit:** is `USER_SEAT_LIMIT` per deployment, default 3, right, and do **inactive** users count (R: yes)?
2. **Permission catalog (Q-UP-13):** confirm the 34-menu list, and which cells do not apply (the source shows 53). Until answered, every leaf has all 6 actions. Correcting the list later is a code change with no migration.
3. **Location:** accept a static placeholder list (`primary`) now (R), or defer the field (D)?
4. **Existing `role = "user"` accounts** (dev seed only today) get **no** grants after migration (least privilege). The dev seed will grant the demo user VIEW on all menus. Accept?
