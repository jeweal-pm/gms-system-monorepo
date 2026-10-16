# 2026-10-15 app-navigation (UI revisions 1–2)

- New sidebar IA with collapsible sub-menus, collapsed rail with tooltips (per-browser preference), `/setup` landing page and Master Code modal (FE-NAV-001…010).
- Revision 2 (owner instruction, images 6–7): Setup › Partner master context panel beside the rail on `/setup/vendor` and `/setup/customer`; "Partner master" returns to `/setup` with Master Code open; the Setup tab bar is removed from every page and `setup-tabs.tsx` deleted (FE-NAV-013…015).
- Revision 3: rail section buttons show their submenu (links) in the tooltip (FE-NAV-016).
- Checks: typecheck and lint pass; browser checks not run (no test session). See [testing](../apps/frontend/app-navigation/testing.md) and the [TODO](../task/todo/app-navigation.md).
