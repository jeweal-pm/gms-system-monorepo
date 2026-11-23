# Frontend dependency decisions: stock-card

- UI revision: 1
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **no additional packages** (nothing proposed, nothing installed, no ledger row added)

## Reused instead of new libraries (compared against the code, 2026-11-23)

| Need | Reused (C) |
|---|---|
| Table with row states, two-tier header, column-group tints | picker kit `frontend/src/features/trade-document/picker-ui.tsx` + `globals.css` tokens (design 136 / S8), plus `SortIcon` |
| Search, Start -> Due, pager, print/Excel icons, view panel | `memo-outstanding-vendor/components/{filter-bar,parts,customize-view-panel}.tsx` (`Filters` pattern, `DateInput`, `Pager`, `PrintExcel`, `IconButton`, `useDismiss`) |
| Server state | TanStack Query + the typed adapter pattern of `features/sale/api.ts` (installed) |
| Number formatting | `useNumberFormat`, `lib/number-format` (Decimal Setup, ADR-0040) |
| Icons | `lucide-react` (installed) |
| Print | `window.print()` with a print-only view (pattern of `print-view.tsx`) |
| Virtual scrolling, table library, date library, Excel library | **not used**: pages are server-paged to 10 / 25 / 50 rows, so no virtualisation or table package is needed |

## Not proposed

- **Excel export** needs a file-writing library or a server export. None is installed (`frontend/package.json`, `backend-api-*/package.json` have no `exceljs` / `xlsx`). Revision 1 keeps Excel disabled (Q-SC-11). If the owner wants it later, SA writes a design (server-side streamed CSV/XLSX, bounded rows) and proposes the package with official evidence and its memory cost for the 4 GB / 2 vCPU budget; this document would then be revised.

## Capacity (estimates, not measurements)

Frontend: two route components of a few hundred lines each, at most 50 rows in the DOM, no new runtime package: negligible bundle cost (estimate). Backend cost (a read-only, bounded, indexed query with a running-balance window over one card) is SA's to size in the handoff (SA-SC-07); the production budget is 4 GB RAM / 2 vCPU total, current aggregate limits in [infra/capacity.md](../../../infra/capacity.md). No container, image, route or storage change is requested from the frontend side.

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| (none) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
