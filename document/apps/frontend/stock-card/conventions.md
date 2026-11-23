# Frontend conventions: stock-card

- Feature ID / UI revision: `stock-card` / 1
- Approved source / architecture guide: pending-review; [architecture](../architecture.md), [ui-spec](ui-spec.md)

## Paths and ownership

| Area | Path | Notes |
|---|---|---|
| Routes | `frontend/src/app/(app)/report/stock-movement/stock-card/page.tsx` and `.../stock-card/[cardKey]/page.tsx` | `TabPage` + Suspense, as `purchase-outstanding` |
| Feature | `frontend/src/features/stock-card/` : `api.ts` (typed client), `model.ts` (URL state, formatting, doc-type map; pure), `components/stock-card-list-page.tsx`, `stock-card-table.tsx`, `stock-card-detail-page.tsx`, `stock-card-header.tsx`, `stock-card-transactions-table.tsx`, `view-panel.tsx` | tests in `frontend/test/stock-card/*.test.ts` (the repo layout is `frontend/test/<feature>/`; vitest includes `test/**/*.test.ts`, so component behaviour is tested through pure model functions and API adapter tests as the other report features do) |
| Shared, edited serially | `frontend/src/features/trade-document/picker-ui.tsx` (purple tone), `frontend/src/app/globals.css` (tokens), `frontend/src/features/home/navigation.ts` (menu), `frontend/src/features/memo-outstanding-vendor/components/parts.tsx` / `filter-bar.tsx` (reuse or extract `Pager`, `PrintExcel`, date range) | integration-owned: none of these is in `ownership.yaml`'s list, but they are shared with other features, so edit once, run the suites of the features that import them |
| Integration-owned (parent) | `document/task/frontend-latest.md`, `document/task/index.md`, `document/adr/tech-stack.md` (no change now), `frontend/src/providers/**`, `frontend/src/app/api/**` (only if the REST adapter needs a new proxy route), `frontend/package.json` (no change) | |

## Components and state

- TypeScript, named exports, Tailwind tokens (`gms-*`), `lucide-react` icons, as the neighbouring features. No new package.
- Pages are client components (`"use client"`) because filters live in URL search params and the tab host is client-side.
- Server state is TanStack Query only; no server data in a store. Local UI state: the search text (debounced into the URL), selected row keys (list), the view panel switches (localStorage, wrapped in try/catch).
- The list page and the detail page share `model.ts` for URL parse/serialise (`q`, `location`, `from`, `to`, `sort`, `dir`, `page`, `size`), the formatters and the doc-type route map.
- Accessibility: header cells are `<th scope="col">` with `aria-sort`; the two-tier header uses `colSpan`; a clickable row has an accessible name "Open stock card {stone code}, {location}, {lot}"; the DOC NO link is a real `<a>`; focus returns to the originating row after Back; sort buttons have `aria-label`s (C pattern).

## Delivery

TODO [`stock-card`](../../../task/todo/stock-card.md); dependencies [dependencies.md](dependencies.md); SA contract [handoff](../../../coordination/handoffs/stock-card-sa.md) (pending); tests [testing.md](testing.md). Completion evidence goes under `document/task/done/`. Templates were checklists, not requirements.
