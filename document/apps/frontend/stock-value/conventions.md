# Frontend conventions: stock-value

- Feature ID / UI revision: `stock-value` / 1
- Approved source / architecture guide: approved by instruction (see the [TODO](../../../task/todo/stock-value.md)); [architecture](../architecture.md), [ui-spec](ui-spec.md), precedent [stock-card conventions](../stock-card/conventions.md)

## Paths and ownership

| Area | Path | Notes |
|---|---|---|
| Routes | `frontend/src/app/(app)/report/stock-movement/stock-value/page.tsx` and `.../stock-value/[cardKey]/page.tsx` | `TabPage` + Suspense, copy of the `stock-card` route files with the title "Stock Value" |
| Feature | `frontend/src/features/stock-value/` : `api.ts` (typed client + hooks), `types.ts`, `model.ts` (value-specific pure functions: sort keys, price-source caption, unit label, money / P/L formatting, tooltips, "n without price", the "as at" line, URL-state wrappers), `view-prefs.ts`, `components/stock-value-list-page.tsx`, `stock-value-table.tsx`, `stock-value-detail-page.tsx`, `stock-value-transactions-table.tsx`, `value-cells.tsx`, `view-panel.tsx`, `print-view.tsx`, `print.module.css` | tests in `frontend/test/stock-value/*.test.ts` (vitest includes `test/**/*.test.ts`; no DOM renderer, so component behaviour is tested through pure functions and rendered-to-markup tests, as Stock Card does) |
| Reused from Stock Card (import, do not copy) | `features/stock-card/model.ts` (`ReportState`, `parseState` helpers, `PAGE_SIZES`, `formatShortDate`, `specLine`, `docHref`, `rowNumber`, `rangeProblem`, `filterSummary`, `toggleSort`), `components/parts.tsx` (`SearchBox`, `LocationSelect`, `DateRange`, `ToolIcons`, `SortTh`, `GroupSortTh`, `PlainTh`, `ErrorBanner`, `EmptyCard`, `TableSkeleton`), `stock-card-header.tsx`, `back-link.tsx` | Texts and hrefs that are Stock Card specific are parametrized or extracted by FE-SV-004 with **no behaviour change** to Stock Card (its suites must still pass) |
| Shared, edited serially | `frontend/src/app/globals.css` (blue and purple-active tokens), `frontend/src/features/trade-document/picker-ui.tsx` (`blue` tone, hover, ticked purple), `frontend/src/features/home/navigation.ts` (`REAL_PAGE_HREFS["stock-value"]`, `activePrefix`), the Stock Card files named above | not in `ownership.yaml`'s list, but shared with other features; edit once, run the suites of every feature that imports them |
| Integration-owned (parent) | `document/task/frontend-latest.md`, `document/task/index.md`, `document/adr/tech-stack.md` (no change), `frontend/src/providers/**`, `frontend/src/app/api/**` (only if the REST adapter needs a new proxy route; Stock Card needed none), `frontend/package.json` (no change) | |

Do not touch `backend-api-auth/src/trpc/auth-trpc.csrf.ts` or its test (unrelated uncommitted changes).

## Components and state

- TypeScript, named exports, Tailwind tokens (`gms-*`), `lucide-react` icons. No new package.
- Pages are client components (`"use client"`): filters live in URL search params and the tab host is client-side.
- Server state is TanStack Query only; no server data in a store. Local UI state: the search text (debounced into the URL), selected row keys (list), the Customize-view switches (localStorage inside try/catch).
- **Money is never computed in the UI.** Price, Amount, Profit/Loss and every Total are decimal strings from the API; components only format them with `formatMoney(value, pricePlaces)` and `formatWeight(value, weightPlaces)` from `lib/number-format` through `useNumberFormat()`. A lint-level rule for reviewers: no `*`, `+` or `reduce` on money strings in `features/stock-value/**`.
- The price-source caption, unit label, "—" rules and the red negative P/L are pure functions in `model.ts` (unit-tested) used by `value-cells.tsx`.
- Accessibility: header cells are `<th scope="col">` with `aria-sort`; two-tier headers use `colSpan` / `rowSpan`; a clickable row has an accessible name "Open stock value of {stone code}, {location}, {lot}"; the DOC NO link is a real `<a>`; a Price cell keeps its caption as visible text and adds the tooltip as `title`; "—" has `aria-label="No value"`; the Total row is a `<tfoot>` row labelled "Total"; focus returns to the originating row after Back; sort buttons have `aria-label`s.

## Delivery

TODO [`stock-value`](../../../task/todo/stock-value.md); dependencies [dependencies.md](dependencies.md); SA contract [handoff](../../../coordination/handoffs/stock-value-sa.md); tests [testing.md](testing.md). Completion evidence goes under `document/task/done/`. Templates were checklists, not requirements.
