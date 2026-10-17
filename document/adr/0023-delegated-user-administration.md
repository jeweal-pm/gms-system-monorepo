# ADR-0023: Delegated user administration (User and Permission by permission, not Super Admin only)

- **Status:** Accepted — 2026-10-17
- **Date:** 2026-10-17
- **Feature / source UI revision:** `user-permission` / 2 (no new design; buttons follow the menu-visibility rule)
- **SA revision:** 3 ([delegated-admin.md](../apps/backend/auth/user-permission/delegated-admin.md), DA-01…07)
- **Deciders:** Project owner
- **Approval evidence:** 2026-10-17 owner: "user ปกติ ที่ไม่ใช่ super admin ถ้ามีสิทธิ์สามารถเข้าถึงหน้า user permission ได้" (instruction to implement, following the earlier request "User and permission ทุก user ที่มีสิทธิ์สามารถเข้าได้ …"). Open questions used their defaults: Q-DA-1 password reset with EDIT = yes; Q-DA-2 Approve stays visible to everyone.
- **Supersedes / related ADRs:** changes [ADR-0017](0017-super-admin-managed-users.md) (user management Super Admin only) and [ADR-0020](0020-username-login-and-permission-matrix-v2.md) §4 (who may edit); keeps ADR-0016's `menuKey:action` model.

## Context

User and Permission was Super Admin only in three places: the page guard, the gateway `superAdminProcedure` and the auth `user-admin` role check. The owner wants anyone granted the page to use it, with the same rules as other menus. Without limits, anyone with EDIT on this page could grant themselves every permission.

## Decision

1. **DA-01 access:** catalog leaf `user-and-permission`. VIEW → `userAdmin.list/get/locationOptions`, `permission.catalog`; ADD → create; EDIT → update (including password reset, Q-DA-1); DELETE → delete. Super Admin passes everything. Enforced in the gateway (`permittedProcedure`) and again in auth (`requireAccess`), because auth port 3101 is reachable inside the Compose network.
2. **DA-02 no escalation:** a non-Super-Admin may only grant keys they hold. Otherwise the call fails with `PERMISSION_GRANT_NOT_ALLOWED` (403). In the matrix, cells the admin does not hold are disabled. Duplicate drops copied keys the admin can't grant.
3. **DA-03…05 manageable targets:** a non-Super-Admin may change or delete only users whose grants are all within their own. They may never change a Super Admin or their own account. Otherwise the call fails with `USER_NOT_MANAGEABLE` (403), checked before Argon2 and again under the target row lock. `userAdmin.get` returns `manageable`, and the page disables Edit and Delete when it is false.
4. **DA-06:** seat limit, licence, username rules, Argon2id, session revocation and audit logs (actor id) are unchanged.
5. **DA-07 errors:** a missing action returns `PERMISSION_DENIED` (gateway and auth). `SUPER_ADMIN_REQUIRED` is no longer returned by `userAdmin.*`.

Contract change: `userAdmin.get` output gains `manageable: boolean` (gateway `userDetailOutputSchema`, auth `get`). No schema or migration change.

## Alternatives

- **Keep Super Admin only:** rejected by the owner.
- **Access by action without DA-02…05:** simpler, but allows self-escalation and taking over more privileged accounts.

## Consequences and capacity

- `requireAccess` adds one bounded grants query per user-admin call for non-Super-Admins (≤ 576 rows, the existing `loadSessionAuthz`).
- Update and delete read the target's grants (≤ 576 rows) inside the existing short transaction.
- No new service, cache, pool or job.
- Rollback: restore `superAdminProcedure` and the role check. Grants and data are untouched.
- Dev dependency: `vitest` 5.0.3 (exact, already used by gateway and partner) added to backend-api-auth for unit tests. Not a runtime dependency.

## Acceptance and approval

- Auth tests UT-DA-01…08 and UT-DA-S01…S11.
- Gateway tests UT-DA-G01…G06.
- Frontend tests UT-DA-F01…F07.
- Dual security review recorded in [the changelog](../changelog/2026-10-17-delegated-user-admin.md).
