# user-permission revision 2 backend (ADR-0020)

## Authorization

- ADR-0020 revision 1 Accepted 2026-10-15; owner: "frontend backend อนุมัติ ADR-0020" (implement instruction).
- Branch `feat/15-10-26-check-fix-userpermission`; nothing committed or pushed. Backend role applied directly (no subagent).

## Completed

- BE-UP2-001…010 (see [TODO](../todo/user-permission.md#revision-2-adr-0020-backend)): username login + lockout, internal email, migration, catalog v2, userAdmin username + update + Super Admin lock, `ACCOUNT_INACTIVE`, CRM username alias, license subject = username, v2 shortcuts, dev seed, SA revision 2 documents.

## Verification

- Auth and gateway: `typecheck`, `lint`, build-config `tsc` all exit 0; frontend `tsc --noEmit` 0 errors (read-only).
- Migration applied on the dev DB; `prisma migrate diff` empty; existing users sign in with their old email text as username.
- 57/57 runtime checks against the live dev stack ([results](../../apps/backend/auth/user-permission/testing.md#results--sa-revision-2-backend-2026-10-15)). Test users removed.

## Not done / deviations

- Photo on create/update (still deferred). Browser and manual-tester checks belong to the frontend run.
- Handoff: [user-permission-v2-backend.md](../../coordination/handoffs/user-permission-v2-backend.md).
