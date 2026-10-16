# 2026-10-15 — user-permission revision 2 backend (ADR-0020)

- Login by username (`POST /api/auth/sign-in/username`, Better Auth `username` plugin from installed 1.7.7); `/sign-in/email` disabled; internal email `<id>@users.invalid`.
- Migration `20261015120000_username_permission_v2`: `User.username` (backfilled from email), enum `APPROVE`/`PRINT`/`EXCEL`, all grants wiped.
- Permission catalog v2 (9 actions, 39 leaves, 347 cells); Home shortcuts follow v2 keys and `dashboard:VIEW`.
- `userAdmin.*` uses `username`; new `userAdmin.update` with Super Admin lock (`SUPER_ADMIN_LOCKED`), `USERNAME_TAKEN`, `USERNAME_IMMUTABLE`; `ACCOUNT_INACTIVE` on sign-in.
- CRM `POST /api/v1/users` accepts `username` (deprecated `email` alias); license subject = username.
- Photo upload still deferred. Handoff: [user-permission-v2-backend.md](../coordination/handoffs/user-permission-v2-backend.md).
