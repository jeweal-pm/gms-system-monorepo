# Authorization: auth + gateway / user-permission

- Source UI revision / SA revision: 1 / 1 (pending-review)
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
| Create user | as above | creates only `role="user"`; role is not an input | auth sets the role server-side; license preflight on the target email; seat cap | 422/503 target license; 409 limit | BE-UP-006 / BT-UP-03..06 |
| Update / reset password / deactivate | as above | target `role="user"` only; Super Admin rows read-only (own password via Profile, ADR-0011) | auth loads the target, rejects admins; optimistic version | 403 `SUPER_ADMIN_READ_ONLY`; 409 `USER_CHANGED` | BE-UP-007 / BT-UP-07..10 |
| Change email | denied | email immutable (QL2) | no `email` in the update schema (strict → `VALIDATION_ERROR`) | 400 | BE-UP-007 / BT-UP-11 |
| Delete | as above | target `role="user"` and ≠ caller | auth guard inside the transaction | 403 `SUPER_ADMIN_READ_ONLY`; 404 | BE-UP-008 / BT-UP-12 |
| Grant changes take effect | — | — | session-context reads grants on every request (no cache) | next request uses the new grants | BE-UP-004 / BT-UP-13 |
| Menu/domain procedures (now `dashboard.shortcutGroups`; future features) | session + license | Super Admin: all; others: the matching `menuKey:ACTION` | gateway `permittedProcedure(menuKey, action)`; price fields only with `menuKey:PRICE` | 403 `PERMISSION_DENIED` (filter for shortcuts) | BE-UP-010 / BT-UP-14 |
| Sign-in of inactive user | correct password | none | Better Auth after-hook removes the new session | 403 `ACCOUNT_INACTIVE` | BE-UP-011 / BT-UP-15 |
| Existing session of a deactivated user | — | — | sessions deleted on deactivate; session-context also returns 401 if `active=false` | 401 → existing redirect to `/login` | BE-UP-007/011 / BT-UP-16 |
| CRM provisioning | CRM API key | unchanged | unchanged; shared provisioning routine | unchanged | BE-UP-006 / BT-UP-17 |

Super Admin's implicit ALL permissions never bypass the license check: ADR-0013 remains
"every account, including Super Admin, must hold a license". Frontend hiding of menus/buttons
is UX only. Logs record actor/target IDs and changed field names, never values.
