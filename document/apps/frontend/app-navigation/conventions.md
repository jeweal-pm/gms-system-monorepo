# Frontend conventions: app-navigation

- Feature ID / UI revision: `app-navigation` / 1 (pending-review)
- Sources: [ui-spec.md](ui-spec.md); [frontend architecture](../architecture.md); prior shell work: user-permission FE-UP-017 ([TODO](../../../task/todo/user-permission.md))

## Paths and ownership

| Path | Change | Scope (ownership.yaml) |
|---|---|---|
| `frontend/src/features/home/navigation.ts` | New IA model, rail modules, placeholder slug catalog, breadcrumbs, active matching (FE-NAV-001) | `frontend-home` |
| `frontend/src/features/home/sidebar.tsx` | Expanded sidebar restyle, disclosure, collapse toggle (FE-NAV-002) | `frontend-home` |
| `frontend/src/features/home/sidebar-disclosure.tsx` (new) | Disclosure parent + sub-links | `frontend-home` |
| `frontend/src/features/home/sidebar-rail.tsx` (new) | Rail, rail buttons, tooltip (FE-NAV-003) | `frontend-home` |
| `frontend/src/features/home/use-sidebar-collapsed.ts` (new) | `localStorage` preference hook | `frontend-home` |
| `frontend/src/features/home/app-shell.tsx` | Switch expanded/rail at ≥ md; drawer unchanged (FE-NAV-003/004) | `frontend-home` |
| `frontend/src/features/home/gms-mark.tsx` | `variant="mark"` CSS crop (FE-NAV-005) | `frontend-home` |
| `frontend/src/app/modules/[slug]/page.tsx` | No code change expected (resolves new slugs through the model); edit only if the breadcrumb API changes | `frontend-home` |
| `frontend/src/app/setup/page.tsx` (new) | Route `/setup` in `AppShell`, breadcrumbs `[Home(/), Setup]` (FE-NAV-006) | `frontend-feature` (`setup`) |
| `frontend/src/features/setup/setup-landing.tsx`, `setup-tile.tsx`, `master-code-dialog.tsx`, `setup-destinations.ts` (new) | Landing grid, tile, dialog, tile config (FE-NAV-006/007) | `frontend-feature` (`setup`) |
| `frontend/src/app/setup/{user-permission,vendor,customer}/page.tsx` | Only the `breadcrumbs` constant: "Setup" gets `href: "/setup"` (FE-NAV-008) | `frontend-feature`; cross-feature edit recorded in the task claim |
| `frontend/src/features/setup/setup-tabs.tsx` | **No change** (Q-NAV-14) | — |
| `frontend/src/app/globals.css` | New tokens + `gms-nav-active` value (FE-NAV-009) | shared; single writer per run, serialized via parent |
| `frontend/package.json`, `pnpm-lock.yaml`, providers, `next.config.ts`, `api/**` | **No change** | integration-owned |
| `frontend/public/` | **No new asset** unless the owner supplies a mark file (Q-NAV-10) | frontend-home |

`navigationGroups` / `reportLibraryItems` and the gateway `dashboard.shortcutGroups` (Home shortcuts) are out of scope. Remove `reportLibraryItems` only if nothing imports it after FE-NAV-001 (lint will show an unused export only if configured; check with grep).

## Components and state

- TypeScript strict; named exports; Tailwind utilities with `gms-*` tokens; no hex values in components; Lucide icons with `aria-hidden`.
- Server/client: `AppShell`, `Sidebar`, `SidebarRail`, the Setup landing and the dialog are client components (they use `usePathname`, state, `localStorage`, `showModal`). `app/setup/page.tsx` follows the existing pattern (`"use client"` page that renders `AppShell` with breadcrumbs).
- State: local UI state only. Disclosure open set: `useState<Set<string>>` in `Sidebar`, seeded and extended from the active route. Collapse preference: `useSyncExternalStore` over `localStorage` + `storage` event, server snapshot `false` (expanded) for deterministic hydration. Dialog open: `useRef<HTMLDialogElement>` + `showModal()`/`close()`. No TanStack Query or tRPC call is added.
- Model shape (proposal, keep it data-driven so the drawer, sidebar, rail and breadcrumbs share one source):

```ts
type NavLink = { kind: "link"; id: string; label: string; href: string; icon?: LucideIcon; activePrefix?: string; activeHrefs?: string[] };
type NavDisclosure = { kind: "disclosure"; id: string; label: string; icon: LucideIcon; children: NavLink[] };
type NavSection = { id: string; title?: string; items: (NavLink | NavDisclosure)[] };
type RailModule = { id: string; label: string; icon: LucideIcon } & ({ kind: "link"; href: string } | { kind: "section"; sectionId: string });
```

- Semantic HTML: `<aside>` → `<nav aria-label="Main menu">` → section `h2` + `ul`; disclosure `button` + `ul[id]`; rail `<nav aria-label="Main menu">` with `ul`; landing `h1` + `ul` of tiles; dialog `<dialog aria-labelledby>`.
- Keyboard/focus per [ui-spec.md](ui-spec.md#interaction-and-behavior). Only one of expanded sidebar / rail is rendered at a time (not both hidden by CSS) so focus order and landmarks stay single.
- Hydration: no `Date`/`localStorage` reads during render on the server; the preference applies after mount.

## Delivery

- UI TODO: [app-navigation.md](../../../task/todo/app-navigation.md); dependency decision: [dependencies.md](dependencies.md) (none new); SA: none required (deferred topics in the [SA handoff](../../../coordination/handoffs/app-navigation-sa.md), not dispatched); acceptance: [testing.md](testing.md).
- Before code: record a task claim under `document/coordination/tasks/` listing the paths above; the parent serializes `globals.css`.
- Completion evidence: `document/task/done/YYYY-MM-DD-app-navigation.md`; customer check under `document/testing/user-check/` (navigation journey changes, so manual-tester applies).
