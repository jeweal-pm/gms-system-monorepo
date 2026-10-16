# 2026-10-15 user-permission UI revision 2 frontend (ADR-0020, FE-UP2-001…010)

- Login signs in by username: `usernameClient()` in `frontend/src/lib/auth-client.ts`, `authClient.signIn.username`, label "Username", no e-mail format check, `ACCOUNT_INACTIVE` message; lockout/attempt messages unchanged.
- User and Permission page follows rev2-01..04: Create User / Cancel / Save / Edit / Delete with create/view/edit modes, `userAdmin.update` (blank password = unchanged, `expectedUpdatedAt`), catalog v2 matrix (9 actions, sections, groups with "N sub-menus", Dashboard "—", search, filter, Expand/Collapse All, "x of 347 permissions on"), locked Super Admin with banner and editable Name/Phone/Location, delete dialog "Delete {username}?", drawer rows with username.
- Shared UI: additive `DisabledCheckbox` in `frontend/src/components/ui/checkbox.tsx`. Avatar menu shows `username` instead of the internal e-mail (parent-assigned).
- No package changes. Photo upload and Excel export are still unavailable.
- Evidence: TODO "Frontend progress: UI revision 2" in `document/task/todo/user-permission.md`; `document/apps/frontend/user-permission/testing.md` revision 2 cases. Browser checks not run.
