# ADR-0017: Super Admin manages regular users and their passwords in-app, alongside CRM provisioning

- Status: Accepted (SA revision 1, 2026-10-12; evidence: 2026-10-12 owner: 'frontend backend หน้า user permission ให้สามารถ add user และ delete user ได้')
- Date: 2026-10-12
- Feature / source UI revision: `user-permission` / 1 (UI approved 2026-10-12)
- SA revision: 1
- Deciders: Project owner (approval pending)
- Approval evidence: none
- Supersedes / related ADRs: amends (does not supersede) [ADR-0015](0015-remove-forgot-password-and-email.md) §1 "CRM is the only creator" and resolves its open "admin reset tool" item; respects [ADR-0013](0013-per-user-license-with-signed-token.md) and [ADR-0014](0014-mock-license-client.md) unchanged; related [ADR-0011](0011-change-password-via-profile-page.md), [ADR-0012](0012-change-flow-login.md), [ADR-0016](0016-per-user-menu-action-permissions.md)

## Context

The approved UI ([ui-spec](../apps/frontend/user-permission/ui-spec.md)) lets Super Admin
create, edit, deactivate and delete users and set their password, phone, locations and photo,
with "N of 3 users added. Super Admin is not counted." Accepted decisions say:
CRM creates users with a CRM-supplied password (ADR-0015, BR-01); every account, including
Super Admin, needs an issued license, and `pending` qualifies (ADR-0013, QL3, AC-L12); a
licensed email is immutable (QL2); and in-app admin password setting was a rejected alternative
"for a separate ADR" (ADR-0015). Conflicts C-01…C-06 and C-08 are in the
[open questions](../apps/frontend/user-permission/open-questions.md). Resolutions are in
[decisions.md](../apps/backend/auth/user-permission/decisions.md).

## Decision

1. **Two creation paths, one routine.** CRM `POST /api/v1/users` is unchanged and remains
   the only way to create a Super Admin (`role="admin"`). Super Admin creates **regular users**
   (`role="user"`) through gateway tRPC `userAdmin.create`. Both call one auth provisioning
   routine: validate → duplicate check → **license preflight** (`pending`, or a verified usable
   `active`; otherwise nothing is created) → Argon2id → transaction → license-token cache with
   the existing compensation. Target-license failures use `USER_LICENSE_NOT_ELIGIBLE` /
   `USER_LICENSE_UNVERIFIABLE`.
2. **Seat cap:** `USER_SEAT_LIMIT` (deployment env, integer 0–500, default 3). It counts
   `role="user"` accounts **including inactive**; Super Admins are excluded. It is enforced
   under a PostgreSQL advisory transaction lock. The cap is independent of licensing; every
   account still needs a license.
3. **Passwords:** Super Admin sets the initial password and may **reset** a regular user's
   password (policy 4–64, Argon2id, write-only, never logged). A reset revokes all of the
   target's sessions and clears its login lockout. Super Admin's own password changes only via
   Profile (ADR-0011). No email or generated password (ADR-0015 stands).
4. **Identity:** the "Username" field is the sign-in email, normalized and unique, and is
   **immutable after creation** for every account (QL2). There is no username login.
5. **Active flag:** `User.active` (default true). Deactivation revokes sessions immediately.
   A correct-password sign-in of an inactive account returns 403 `ACCOUNT_INACTIVE`, and
   session-context rejects inactive users. The license is untouched, and the user still
   counts toward the cap.
6. **Delete:** hard delete of the local account only (cascade). Super Admin and self cannot
   be deleted. The license server is not called; QL1 stays external policy.
7. **Profile data:** phone as E.164 + ISO country (nullable); locations as keys from a static
   option list (`primary`) until a Location master exists, with no data scoping; photo as
   JPEG/PNG ≤ 512 KiB in `auth.UserPhoto` (PostgreSQL `bytea`). The client resizes and
   re-encodes to ≤ 512×512 (strips EXIF); the server checks magic bytes and size. The photo is
   downloaded via REST with `nosniff`. No new container or volume.
8. **Super Admin rows are read-only** on this page.

## Alternatives

| Option | Why not chosen |
|---|---|
| CRM-only creation; page edits permissions only | Smallest change, but contradicts the approved UI (Create User, Password, Delete) |
| Page replaces CRM | Breaking change for CRM integration and Super Admin bootstrap |
| Create users without a license | Violates ADR-0013/QL3/AC-L12 |
| Seat count from license-server `GET /v1/licenses` | New upstream dependency in the hot path; fails during outage; `license.list` deferred |
| Initial password only, no reset | Leaves no in-system recovery for forgotten passwords (ADR-0015 consequence) |
| Separate username login (Better Auth `username` plugin) | New identifier not bound by the license; extra plugin |
| Soft delete | Needs partial unique indexes and filters everywhere; no business table references users yet. Revisit when one does |
| Photo on a file-system volume or in MinIO/object storage | Needs infra work (volume ownership, backups, quota) or a new container with RAM/CPU cost on the 8 GB / 4 vCPU host; PostgreSQL `bytea` with a 512 KiB cap is bounded for ≤ 500 users |
| Server-side image re-encoding with `sharp` | Native dependency and memory spikes; client canvas re-encode suffices for an admin-only upload |

## Consequences and capacity

- ADR-0015 §1 changes from "CRM is the only creator" to "CRM is the only creator of Super
  Admins; Super Admin creates regular users". Login requirements BR-01 and the API contract
  spec need a follow-up note after approval (SA, documentation only). The tech-stack
  pre-production item "admin reset tool" becomes resolved by this ADR once implemented.
- New auth env var `USER_SEAT_LIMIT` (Compose/`.env.example`, parent-serialized). No image,
  network, port or volume change, so no infra bundle is needed under this option. Choosing a
  file-system photo volume instead requires infra research and SA revision 2.
- Capacity: no new process. Photos ≤ 512 KiB × (limit + admins) on disk. Request bodies are
  capped at 1 MiB on the user-admin routes only. Create latency is dominated by license lookup
  (≤ 3 s) plus Argon2.
- Security: admin password reset is a privileged action; it is logged with IDs only and
  revokes sessions. Super Admin compromise already implies full control. A rollback to old
  images re-enables sign-in for deactivated users (release note).
- Migration is additive; see the [database diagram](../apps/backend/auth/user-permission/database-diagram.md).

## Acceptance and approval

Checks: BT-UP-03…12, 15, 17…21 in the [verification plan](../apps/backend/auth/user-permission/testing.md).
Approval covers this ADR revision 1, ADR-0016 revision 1, the SA bundle
`document/apps/backend/auth/user-permission/` revision 1 (architecture, decisions, API,
authorization, sequence, database, errors, dependencies, testing) and backend rows `BE-UP-*`.
No new package. Keep Proposed until the owner approves this exact revision.
