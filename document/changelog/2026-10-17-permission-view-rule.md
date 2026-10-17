# 2026-10-17 Permission rule: every action needs VIEW

- SA addendum [view-dependency.md](../apps/backend/auth/user-permission/view-dependency.md): VD-01 any action on a menu turns on its VIEW; VD-02 turning off VIEW clears the menu's other actions; VD-03 aggregates (Select All, group rows) apply it per menu; VD-04 turning off another action keeps VIEW; VD-05 saved users shown as stored. VD-06 (backend normalization) proposed, not implemented.
- Frontend: `toggleCells` in `permission-utils.ts`, used by `permission-matrix.tsx`; hint text in `permissions-card.tsx`.
- Tests: UT-UP-F10…F16 (frontend suite 226 pass); typecheck pass; lint 0 errors. Browser check not run.
