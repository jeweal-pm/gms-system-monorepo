# Frontend dependency decisions: approve-center

- UI revision: 1 (approved 2026-11-07)
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md) (unchanged)
- Status: **no additional packages**

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | — | — | — | — | — | — | — | — |

Reused (installed, `frontend/package.json`): Next.js 16.4.1 App Router, React 19.3.0, `@tanstack/react-query` 5 with `@trpc/react-query` 11 (counts, infinite list, mutations), `lucide-react` (Search, Info, Inbox icons), `motion` only if the existing panel already uses it. Existing components: `button.tsx`, `checkbox.tsx`, `sort-icon.tsx`, `confirm-dialog.tsx`, `toast.tsx`, `TabPage`, `nav-icons.tsx`, `sidebar-context-panel.tsx` styling.

A plain semantic `<table>` covers 50-row pages; a table/virtualisation library is not needed at this size. If SA later allows much larger pages, revisit before adding one.
