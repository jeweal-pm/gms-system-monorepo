# Delegated user administration (user-permission, SA revision 3 proposal)

- Date: 2026-10-17. Status: **approved and implemented 2026-10-17** (owner: "user ปกติ ที่ไม่ใช่ super admin ถ้ามีสิทธิ์สามารถเข้าถึงหน้า user permission ได้"; Q-DA-1/Q-DA-2 defaults). Recorded as [ADR-0023](../../../../adr/0023-delegated-user-administration.md).
- Owner request (verbatim): "frontend backend มีเปลี่ยนคือ User and permission ทุก user ที่มีสิทธิ์สามารถเข้าได้และถ้าหากเมนูไหนไม่มีสิทธิ์ VIEW ก็จะไม่เห็นเมนูนั้นเลย และ ถ้าหากมีสิทธิ์ view แต่ไม่มีสิทธิ์อื่นให้ปุ่มยังอยู่แต่ disable และหากมีสิทธิ์ view อย่างเดียวให้เข้ามาเจอหน้า add ได้แต่ disable ทุกอย่างไว้"
- Changes [ADR-0017](../../../../adr/0017-super-admin-managed-users.md) (user management was Super Admin only, enforced in the page, gateway `superAdminProcedure` and auth `user-admin.service.ts` role check). Recorded in ADR-0023.
- Not part of this proposal (already done in the frontend on the existing `permission.mine` contract, owner instruction): menus hidden without VIEW, buttons disabled instead of hidden, VIEW-only users land on a disabled Add page — see the changelog 2026-10-17-menu-visibility.

## Decisions (approve "DA as written", or name an ID to change it)

| ID | Decision | Why |
|---|---|---|
| DA-01 | Access by the catalog leaf `user-and-permission`: **VIEW** → `userAdmin.list/get`, `permission.catalog`, `locationOptions`; **ADD** → `create`; **EDIT** → `update`; **DELETE** → `delete`. Super Admin keeps everything. Enforced in the gateway (`permittedProcedure`) **and** in the auth service (it owns users and grants). | Same model as every other menu (ADR-0016/0020). |
| DA-02 | **No privilege escalation**: a non-Super-Admin may only grant permissions they hold themselves. A save that adds any other key is rejected with `PERMISSION_GRANT_NOT_ALLOWED` (403, field `permissions`). In the matrix, cells the admin does not hold are disabled. | Otherwise anyone with EDIT on this page could give themselves or a friend every permission. |
| DA-03 | A non-Super-Admin may change or delete only users whose current grants are all within their own grants; other users are shown read-only. | Stops removing or downgrading a more privileged user. |
| DA-04 | Super Admin accounts: read-only for non-Super-Admins (no edit, password reset, deactivate or delete). | Keeps ADR-0017's guarantee. |
| DA-05 | Own account on this page: read-only (no self-edit of permissions, active or delete). Own password stays on the Profile page (ADR-0011). | Prevents self-escalation and self-lockout. |
| DA-06 | Seat limit, licence checks, username rules, Argon2id and the audit log are unchanged; log entries carry the actor id and `grantedBy`. | — |
| DA-07 | Errors: existing codes plus `PERMISSION_GRANT_NOT_ALLOWED`, `USER_NOT_MANAGEABLE` (DA-03/04/05). `SUPER_ADMIN_REQUIRED` is no longer returned by `userAdmin.*`. | Clear UI messages. |

## Work after approval

Auth: replace the Super Admin check in `user-admin` with action checks + DA-02…05 (tests for each rule). Gateway: `userAdmin.*` and `permission.catalog` on `permittedProcedure("user-and-permission", …)`. Frontend: page gate `user-and-permission:VIEW`, header buttons disabled by action, matrix cells limited to the admin's own grants, read-only rows per DA-03…05. Security reviews (sec-auditor, security-auditor) before handoff, as AGENTS.md requires.

## Open questions (defaults used if not answered)

- Q-DA-1: Should a delegated admin be able to reset another user's password? Default: yes with EDIT (subject to DA-03/04).
- Q-DA-2: The sidebar "Approve" item has no catalog key. Default: visible to everyone until an Approve permission exists.
