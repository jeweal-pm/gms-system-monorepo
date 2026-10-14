# Frontend conventions: user-permission

- Feature ID / UI revision: `user-permission` / 1
- Approved source / architecture guide: none approved yet (pending-review); [ui-spec.md](ui-spec.md), [frontend architecture](../architecture.md)

## Paths and ownership

| Path (proposed) | Purpose | Scope / owner |
|---|---|---|
| `frontend/src/app/setup/user-permission/page.tsx` | Route `/setup/user-permission` (client page inside `AppShell`) | frontend-feature (new route). The route name needs owner confirmation. Existing Setup items use `/modules/<slug>` placeholders. |
| `frontend/src/features/setup/setup-tabs.tsx` | Setup tab bar shared by Setup pages | frontend-feature (new `setup` feature folder) |
| `frontend/src/features/user-permission/**` | Page, form, matrix, drawer, dialog, schemas, hooks, fixtures | frontend-feature (new) |
| `frontend/src/features/user-permission/components/ui/**` | Feature-local primitives (Button, IconButton, Switch, Checkbox, OutlinedTextField, Toast, ConfirmDialog). They can be promoted to a shared folder later through a separate decision. | frontend-feature |
| `frontend/src/app/globals.css` | Design tokens (`@theme`) | Shared file; the parent serializes edits (FE-UP-011) |
| `frontend/src/features/home/navigation.ts`, `app-shell.tsx` | Sidebar entry "Setup" and any shell restyle | `frontend-home` scope; cross-scope handoff needed (FE-UP-001, FE-UP-017; Q-UP-21) |
| `frontend/package.json`, `pnpm-lock.yaml` | Only if DEP-UP-01/02 are approved | Integration-owned; the parent serializes |
| `frontend/src/providers/**`, `frontend/src/app/api/**` | Not expected to change | Integration-owned |

## Components and state

- TypeScript strict, named exports, kebab-case filenames, matching `features/auth` and `features/home`.
- Client components (`"use client"`) for the page body, because it is interactive. The route file keeps the same pattern as `app/modules/[slug]/page.tsx`.
- Form state: `react-hook-form` + `zod` (installed), validated through `@hookform/resolvers/zod`. The password rule reuses the 4–64 policy. Copy the message wording from `backend-api-auth/src/auth/password-policy.ts`/spec 0003 rather than importing across packages.
- Matrix state: one `Record<permissionKey, boolean>` in the form (`permissions` field), with keys `${menuId}:${action}`. Group, Select All and count are derived with `useMemo` from the catalog and values. Do not store derived state.
- Server state: TanStack Query through the existing typed tRPC client only after SA approval. No server data is copied into local stores, and no Zustand.
- Local UI state: drawer open (optionally remembered in `localStorage` in a try/catch), group expand/collapse, search text, dialog open, toasts.
- Hydration: the date in the header comes from the existing `AppShell` (after mount). No `Date.now()`/random values in the render path.
- Semantic HTML: `<table>` for the matrix, `<aside>` for the drawer, `<dialog>` for confirm, `<form noValidate>` for the form, `<button type="button">` for every non-submit action.

## Delivery

- UI TODO: [document/task/todo/user-permission.md](../../../task/todo/user-permission.md)
- Dependencies: [dependencies.md](dependencies.md) (proposed only)
- Required SA contracts: [SA handoff](../../../coordination/handoffs/user-permission-sa.md)
- Acceptance: [testing.md](testing.md)
- Completion evidence: `document/task/done/YYYY-MM-DD-user-permission.md` (after implementation)
