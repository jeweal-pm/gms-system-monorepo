# 2026-10-17 Delegated user administration (User and Permission by permission)

Owner: "user ปกติ ที่ไม่ใช่ super admin ถ้ามีสิทธิ์สามารถเข้าถึงหน้า user permission ได้". Implements [delegated-admin.md](../apps/backend/auth/user-permission/delegated-admin.md) DA-01…07 with the Q-DA-1/Q-DA-2 defaults. Recorded as [ADR-0023](../adr/0023-delegated-user-administration.md).

## Auth

- `src/user-admin/delegation.ts` (new): `canUseUserAdmin`, `ungrantableKeys` and `isManageableTarget`.
- `user-admin.service.ts`: `requireSuperAdmin` became `requireAccess(request, action)`.
  - Create and update reject keys the caller does not hold (`PERMISSION_GRANT_NOT_ALLOWED`).
  - Update and delete refuse unmanageable targets (`USER_NOT_MANAGEABLE`) before Argon2 and again under the row lock.
  - `get` returns `manageable`.
- `user-admin.controller.ts`:
  - VIEW: catalog, location options, list and get.
  - ADD: create.
  - EDIT: update.
  - DELETE: delete.
- New error codes `PERMISSION_DENIED`, `PERMISSION_GRANT_NOT_ALLOWED` and `USER_NOT_MANAGEABLE`.
- Unit tests now run in auth: vitest 5.0.3 exact (already used by gateway and partner) as a devDependency, plus `vitest.config.mts`.

## Gateway

- `userAdmin.*` and `permission.catalog` use `permittedProcedure("user-and-permission", action)`. `superAdminProcedure` was removed.
- `userDetailOutputSchema.manageable`.

## Frontend

- `features/user-permission/access.ts` (new): `userAdminAccess(mine)`, which gives the actions plus `grantable`, and `grantableOnly` for Duplicate.
- The page opens with `user-and-permission:VIEW`.
- Header buttons are always visible and disabled per action. Edit and Delete are also disabled when `manageable` is false.
- VIEW-only (no ADD) lands on a disabled Add page.
- In the matrix, only cells the admin holds can be toggled. Others are disabled.
- Error messages cover the new codes.

## Checks

- Auth: 19 tests (UT-DA-01…08, UT-DA-S01…S11).
- Gateway: 216 pass, 7 skipped (new UT-DA-G01…G06).
- Frontend: 268 pass (new UT-DA-F01…F07).
- Typecheck and lint pass in all three.
- Live check as the dev Super Admin after restarting auth, gateway and frontend:
  - `userAdmin.list` and `userAdmin.get` return data, and `get` includes `manageable: true`.
  - `permission.catalog` and `/setup/user-permission` return 200.
  - An unauthenticated `userAdmin.list` returns 401.
- Not run: a browser check as a delegated (non-Super-Admin) user. The password of the existing user `pun`, who holds `user-and-permission:VIEW,ADD`, isn't known to the agent.

## Security review

Both reviewers checked the same source: HEAD d19aa55 plus the working tree (diff hash 20de628e1e67cf24; untracked delegation.ts afe34e1a…, access.ts 58e5e5ee…). **Gate passed.**

- **sec-auditor: advisory.** No vulnerability found. Ticket [INV-20261017-002](../task/investigation/INV-20261017-002-delegated-admin-peer-takeover.md): delegated admins with identical grants can reset, deactivate or delete each other. Hardening only; an SA decision is needed.
- **security-auditor: advisory.** Independently agrees with 002. Ticket [INV-20261017-003](../task/investigation/INV-20261017-003-user-admin-argon2-unthrottled-delegated.md): no rate limit on the Argon2 path of create/update, now reachable by ADD/EDIT holders (auth has 0.5 CPU).
- **Both observed:** VIEW-only users see every user's phone number, locations and grants, which DA-01 allows. compliance-auditor can review this on request.
- **After the review:** a comment-only change in gateway router.ts (a doc comment was moved back onto permittedProcedure, and the shortcut comment now cites ADR-0023). No behaviour change; gateway tests still pass (216, 7 skipped).
- Both tickets are pending owner review. No fixes have been started.
