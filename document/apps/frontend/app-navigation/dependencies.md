# Frontend dependency decisions: app-navigation

- UI revision: 1 (pending-review)
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md) — **no entry added** (nothing proposed)
- Status: **no additional packages**

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| `lucide-react` in `frontend` | installed (reuse) | All icons, FE-NAV-001…007 | Verified in the checkout: `frontend/package.json` `^1.52.0`, resolved `1.52.0`; every icon named in ui-spec checked present with `require('lucide-react')` on 2026-10-15 | Tabler (below) | Per-icon ESM, tree-shaken; ≈30 icons (estimate a few kB gzip); no runtime service | none | existing | 1.52.0 |
| Native `<dialog>` + `showModal()` | platform | Master Code modal, FE-NAV-007 | Baseline widely available since 2022 ([MDN `<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)); same approach as the existing `frontend/src/components/ui/confirm-dialog.tsx` | Radix Dialog / Headless UI (not installed; not needed) | 0 kB | none | n/a | n/a |
| Native Popover API (`popover="manual"`) | platform | Rail tooltip top layer, FE-NAV-003 | Baseline 2024 ([MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)); graceful degradation: no tooltip, accessible name unchanged | Floating UI / Radix Tooltip (not installed; not needed for one tooltip style) | 0 kB | none | n/a | n/a |
| `localStorage` | platform | Collapse preference, FE-NAV-003 | Wrapped in try/catch; per-viewer convenience only | cookie (would allow SSR-correct width; needs no package but adds request bytes; not chosen) | 0 kB | none | n/a | n/a |
| `@tabler/icons-react` | **considered, not proposed** | Would give exact glyphs (cart-up/down, cards, packages, arrows-exchange) | Not researched further; would require a proposal entry with official evidence if the owner chooses it (Q-NAV-09) | Lucide closest glyphs (chosen) | Tree-shaken per icon, similar to Lucide | none | none | not installed |

Reused components/code: `AppShell`, `Sidebar`/`SidebarLink`, `Topbar`, `Breadcrumbs`, `GmsMark`,
`/modules/[slug]` placeholder, `SetupTabs` (unchanged), `gms-*` tokens. The existing mobile drawer's focus
trap and Escape handling are kept. No package, manifest or lockfile edit is expected; if the owner picks Tabler,
UI revision 2 adds a `proposed` row here and in the central ledger before any installation.
