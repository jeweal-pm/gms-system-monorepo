# Authorization: auth + gateway / user-permission

- Source UI revision / SA revision: 2 / 2 (implemented 2026-10-15; [ADR-0020](../../../../adr/0020-username-login-and-permission-matrix-v2.md) Accepted, owner "frontend backend อนุมัติ ADR-0020")
- Domain rules / API contract: [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [ADR-0017](../../../../adr/0017-super-admin-managed-users.md), [API contract](api-contract.md), [decisions](decisions.md)
- Owner source: 2026-10-12, "ให้ super admin นั้นสามารถ มา set permission ของ user ได้ว่า user สามารถ VIEW ADD EDIT DELETE CANCEL Price" → the page is Super Admin only (Q-UP-20).

**Trust boundary:** identity, role, `active`, grants and license come only from auth's own
validation of the Better Auth session cookie. The browser never supplies a user ID for
"self", a role, or grants that affect its own access. Gateway procedures read the
server-built context. Auth re-checks session + Super Admin on every `/internal/v1/user-admin/**`
call, because auth port 3101 is reachable inside the Compose network and is published in
Compose today.

| Operation / resource | Authentication | Allowed roles / ownership | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `permission.mine`, `permission.catalog` | session + usable license | any licensed user | gateway `licensedProcedure`; data from context / static catalog | 401; license 403/503 | BE-UP-004, BE-UP-007 / BT-UP-01 |
| `userAdmin.*` queries/mutations, photo, export | session + usable license | `role = "admin"` (Super Admin) | gateway `superAdminProcedure` **and** auth `requireSuperAdmin(session)` | 403 `SUPER_ADMIN_REQUIRED` | BE-UP-005..009 / BT-UP-02 |
| Create user | as above | creates only `role="user"`; role is not an input | auth sets the role server-side; license preflight on the target username; seat cap | 422/503 target license; 409 limit | BE-UP-006 / BT-UP-03..06 |
| Update / reset password / deactivate | as above | regular target: every field. Super Admin target (incl. self): only name, phone, locations (ADR-0020 §4); its password changes only via Profile (ADR-0011) | auth pre-checks the role, then re-checks under `SELECT … FOR UPDATE`; optional optimistic version | 403 `SUPER_ADMIN_LOCKED`; 409 `USER_CHANGED` | BE-UP2-005 / BT-UP2-07..12 |
| Change username | denied | username immutable (license subject, ADR-0020 §2) | `username` accepted only when equal to the stored value; Better Auth `/update-user` disabled | 400 `USERNAME_IMMUTABLE` | BE-UP2-005 / BT-UP2-09 |
| Change email | denied | internal value | no `email` in any user-admin schema (strict → `VALIDATION_ERROR`); `/change-email` disabled | 400 / 404 | BE-UP2-002 |
| Delete | as above | target `role="user"` and ≠ caller | auth guard inside the transaction | 403 `SUPER_ADMIN_LOCKED`; 404 | BE-UP-008 / BT-UP-12 |
| Grant changes take effect | — | — | session-context reads grants on every request (no cache) | next request uses the new grants | BE-UP-004 / BT-UP-13 |
| Menu/domain procedures (`customer.*`, `vendor.*`, `dashboard.shortcutGroups`; future features) | session + license | Super Admin: all; others: the matching `menuKey:ACTION` | gateway `permittedProcedure(menuKey, action)`; price fields only with `menuKey:PRICE` | 403 `PERMISSION_DENIED`; shortcuts: no `dashboard:VIEW` → `[]`, else items filtered by `<slug>:VIEW` | BE-UP-010 / BT-UP-14 |
| Sign-in of inactive user | correct password on `/sign-in/username` | none | Better Auth after-hook removes the new session and expires the cookie | 403 `ACCOUNT_INACTIVE` | BE-UP2-003 / BT-UP2-14 |
| Existing session of a deactivated user | — | — | sessions deleted on deactivate; session-context also returns 401 if `active=false` | 401 → existing redirect to `/login` | BE-UP-007/011 / BT-UP-16 |
| CRM provisioning | CRM API key | creates Super Admin (`role="admin"`) | shared provisioning routine; `username` (+ deprecated `email` alias) | 400/409/422/503 | BE-UP2-006 / BT-UP2-20 |

Super Admin's implicit ALL permissions never bypass the license check: ADR-0013 remains
"every account, including Super Admin, must hold a license". Frontend hiding of menus/buttons
is UX only. Logs record actor/target IDs and changed field names, never values.
