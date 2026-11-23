# Frontend dependency decisions: stock-value

- UI revision: 1
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **no additional packages** (nothing proposed, nothing installed, no ledger row added)

## Reused instead of new libraries (compared against the code, 2026-11-23)

| Need | Reused (C) |
|---|---|
| Table with row states, two-tier header, column-group tints | picker kit `frontend/src/features/trade-document/picker-ui.tsx` + `globals.css` tokens, plus `SortTh` / `GroupSortTh` of `features/stock-card/components/parts.tsx`; one new `blue` tone (tokens only) |
| Search, location select, Start -> Due, pager, print / Excel icons, view panel, error / empty / skeleton | `features/stock-card/components/parts.tsx` and `view-panel.tsx` pattern, `Pager`, `PrintExcel`, `IconButton`, `ColumnSwitch` (Memo Outstanding) |
| Server state | TanStack Query + the typed REST client pattern of `features/stock-card/api.ts` (installed) |
| Number formatting | `useNumberFormat`, `lib/number-format` (`formatMoney`, `formatWeight`; Decimal Setup, ADR-0040) |
| Money arithmetic | **none in the UI**: the server returns every amount, so no decimal library is needed in the UI |
| Icons | `lucide-react` (installed) |
| Print | `window.print()` with a print-only view (pattern of Stock Card `print-view.tsx`) |
| Virtual scrolling, table library, date library, Excel library | **not used**: pages are server-paged to 10 / 25 / 50 rows |

## Not proposed

- **Excel export** needs a file-writing library or a server export; none is installed (`frontend/package.json` and the backend manifests have no `exceljs` / `xlsx`). Revision 1 keeps Excel disabled (Q-SV-17). A later revision needs an SA design (bounded, streamed, memory cost for the 4 GB / 2 vCPU budget) and a package proposal with official evidence.
- **Charts / sparklines** for value: not designed, not proposed.

## Capacity (estimates, not measurements)

Frontend: two route components and a handful of small modules, at most 50 rows in the DOM, no new runtime package: negligible bundle cost (estimate). Backend cost is SA's to size ([handoff](../../../coordination/handoffs/stock-value-sa.md), SA-SV-07): the value lookups (Price list is a column of `stock`; **Last sale needs a bounded, indexed lookup of the latest Sale line per stone code**) must stay inside the per-request bounds of Stock Card (page <= 50, at most 2 report queries in flight, 5 s timeout). Production budget: 4 GB RAM / 2 vCPU total, aggregate limits in [infra/capacity.md](../../../infra/capacity.md). No container, image, route or storage change is requested from the frontend side.

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| (none) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
