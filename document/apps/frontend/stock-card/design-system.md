# Design system notes: stock-card

- UI revision: 1 (pending-review)
- Token source: `frontend/src/app/globals.css` (C). Table rules: S8 ([source/S8-table-design-system.png](source/S8-table-design-system.png)) and the shipped picker kit `frontend/src/features/trade-document/picker-ui.tsx`.
- Tags: **M** measured (pixel read from the image), **E** estimated from coordinates, **DS** written on S8, **C** existing code.

## Tokens that already exist and are reused (C)

| Use | Token |
|---|---|
| Table header grey | `--color-gms-table-head` `#E9EDED` (M: S5/S6 header sample is `#E9EDED`, identical) |
| Row hover / active | `--color-gms-row-hover` `#F6FAFA` (M S2/S4), `--color-gms-row-active` `#E5F3F2` (M S2) |
| Green group (IN) | `--color-gms-group-green-head` `#C0E2CE`, `-sub` `#D9EEE1`, `-cell` `#EEF7F2` |
| Orange group (OUT) | `--color-gms-group-orange-head` `#F6DCC0`, `-sub` `#F9EAD9`, `-cell` `#FDF6EE` |
| Text, borders, radii, title | `text-gms-title` 24/32, `text-gms-body` 14/20, `text-gms-label` 12/16, `gms-border`, `gms-text-secondary`, `radius-gms-md` 8, `radius-gms-lg` 12 |
| Primary / back-link pill | `--color-gms-primary` `#006A70`, `--color-gms-count-badge` `#E2F0F0` equals the measured pill of S3 (`#E2F0F0`) |
| Excel icon | `--color-gms-excel` |

## New tokens proposed (add in the same change as the code, FE-SC-001)

The purple column group (BALANCE) is on S8 §2 but not in `globals.css` yet.

| Token | Value | Evidence |
|---|---|---|
| `--color-gms-group-purple-head` | `#DDCEEE` | DS (S8 §2, 30 %) |
| `--color-gms-group-purple-sub` | `#EBE1F5` | DS (S8 §2, 18 %); M (S5 BALANCE sub-header sample `#EBE1F5`) |
| `--color-gms-group-purple-cell` | `#F6F2FB` | DS (S8 §2, 8 %); M (S4/S6 BALANCE cell sample `#F6F2FB`) |
| `--color-gms-group-green-hover` | `#DBE7E7` | M (S4 hovered IN cell) |
| `--color-gms-group-orange-hover` | `#EBE6DE` | M (S4 hovered OUT cell) |
| `--color-gms-group-purple-hover` | `#DDD7E4` | M (S4 hovered BALANCE cell) |

`PickerGroupTone` in `picker-ui.tsx` gains `"purple"` and an optional `hover` class. No hex literal is used in components (C rule); the existing code already uses one inline literal for the sold accent, which is not touched.

## Measured versus design-sheet differences (Q-SC-18)

| Item | S5/S6 page screenshots (M) | S8 sheet (DS) | Used |
|---|---|---|---|
| IN cell | `#EAF3EF` | `#EEF7F2` | DS (existing token) |
| OUT cell | `#FAF3E9` | `#FDF6EE` | DS (existing token) |
| BALANCE cell | `#F6F2FB` | `#F6F2FB` | same |
| Group header (purple) | about `#E9DFF4` | `#DDCEEE` | DS |
| Header height | about 90 px (E) | 68 px = 36 + 32 (S8 §4) | DS 68 px |

If the owner prefers the screenshot values, only the token values change.

## Typography (E from S5/S6 at 1:1 pixels; all map to existing text tokens)

| Element | Size / weight |
|---|---|
| Page title / detail stone code | 24 / 32, medium (`text-gms-title`) |
| Header block values (Stone Code, Location, Lot) | 24, semibold (E) |
| Header block labels, doc type captions, sub-lines, pager text | 12 / 16 (`text-gms-label`), secondary |
| Table text | 14 / 20 (`text-gms-body`); first line bold for Stone Code, Location, DOC NO; BALANCE Cts / Weight bold |
| Numbers | right-aligned, `tabular-nums` |
| Font | existing IBM Plex Sans Thai (`--font-sans`) |

## Spacing, borders, radii (E)

| Item | Value |
|---|---|
| Card inner padding | 24 px |
| Toolbar control height | 36 px (`h-9`), gap 8–10 px |
| Table row | 56 px; cell padding 8 px top/bottom, 12 px left/right (`pickerCell`: `px-3 py-2`) |
| Header block | 1 px `gms-border`, radius about 8 px; cells separated by a 1 px line |
| Total row | about 40 px, 1 px top border, background `#F9F9F9` (M) |
| Back-link hover pill | `#E2F0F0`, radius about 8 px, padding about 8 x 4 (E S3) |

## Icons (C: `lucide-react`)

Columns `Columns3`, print `Printer`, Excel `FileSpreadsheet` (green), refresh `RotateCw`, calendar and arrow in the date range (as `Filters`), chevron `ChevronLeft` for the back link, sort `SortIcon`, search `Search`.

## Colour is never the only signal

IN / OUT / BALANCE are also named in the group header text and each cell is right-aligned under it; the Checkbox-active row also shows a tick.
