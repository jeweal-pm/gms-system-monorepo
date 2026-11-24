# Design system notes: stock-value

- UI revision: 1 (approved by instruction, see the [TODO](../../../task/todo/stock-value.md))
- Token source: `frontend/src/app/globals.css` (C). Table rules: the Stock Card [design-system](../stock-card/design-system.md) and S8 sheet ([source](../stock-card/source/S8-table-design-system.png)); row states re-measured on V4 / V5 ([source/](source/)).
- Tags: **M** measured (pixel read by tool), **E** estimated from coordinates, **DS** written on S8, **C** existing code.

## Tokens that already exist and are reused (C)

Everything in the Stock Card design-system document applies: table head `#E9EDED`, row hover `#F6FAFA`, row active `#E5F3F2`, green / orange / purple group trios, the green / orange / purple hover tints, text tokens, radii, `gms-primary`, `gms-count-badge` (back-link pill `#E2F0F0`), `gms-excel`. Also reused:

| Use | Token |
|---|---|
| Negative Profit/Loss text | `--color-gms-danger` `#DF1016` (M: V1 negative P/L text is exactly `#DF1016`) |
| Caption and sub-lines | `text-gms-label` 12 / 16 with `text-gms-text-secondary` |
| Total row | the `#F9F9F9` Total-row colour added for Stock Card (M: V1, V2 `#F9F9F9`) |

## New tokens proposed (add in the same change as the code, FE-SV-001)

| Token | Value | Evidence |
|---|---|---|
| `--color-gms-group-blue-head` | `#C5D7F4` | M (V2 "Current value" header, tier 1) |
| `--color-gms-group-blue-sub` | `#DCE7F8` | M (V2 tier 2: Price / Amount) |
| `--color-gms-group-blue-cell` | `#F0F4FC` | M (V2 body cells, rows 1 and 2) |
| `--color-gms-group-blue-hover` | `#E7EEF6` | M (V5 hovered Current value cell) |
| `--color-gms-group-purple-active` | `#E6E7F0` | M (V4 BALANCE cells on the ticked row) |

`PickerGroupTone` in `picker-ui.tsx` gains `"blue"` (head / sub / cell) and `pickerGroupHover` gains the blue hover class; a ticked list row needs a purple "active" class (`group-data-[checked]/row` or an explicit class on the cell chosen by `checked`, whichever matches the implementation of `pickerRowClass`). Existing pickers and Stock Card render unchanged (new keys only; no existing value changes). No hex literal is used in components (C rule).

The blue trio follows the same proportions as the other groups in S8 (head about 30 %, sub 18 %, cell 8 % of one hue); S8 has no blue entry, so these are measured from the page and, if the owner's design sheet gets a blue entry, only the three values change.

## Measured versus shipped (Q-SV-16)

| Item | Stock Value sheets (M) | Shipped (C) | Used |
|---|---|---|---|
| Purple BALANCE hover | `#EDECF4` | `#DDD7E4` | **shipped value, kept for both reports** (owner may switch, one token) |
| Purple BALANCE ticked | `#E6E7F0` | cell stays `#F6F2FB` | new token, Stock Value only |
| Group header colours in V1 / V2 | purple `#E9DFF4`, green `#D1E6DB`, orange `#F2E1C8`, blue head `#C5D7F4` / sub `#DCE7F8` | DS purple `#DDCEEE` / `#EBE1F5`, green `#C0E2CE` / `#D9EEE1`, orange `#F6DCC0` / `#F9EAD9` | DS tokens for green / orange / purple (Q-SC-18 rule); blue has no DS value, so the measured blue is used |
| List row height | 66 px | 56 px | 66 px for the Stock Value list (Q-SV-15) |
| Detail row height | 56 px | 56 px | 56 px |
| Header height | about 90 px | 68 px | 68 px |

## Typography (E from V1 / V2 at 1:1 pixels; all map to existing text tokens)

| Element | Size / weight |
|---|---|
| Page title / detail stone code | 24 / 32, medium (`text-gms-title`) |
| Header block values | 24, semibold (as Stock Card) |
| Table text | 14 / 20 (`text-gms-body`); first line bold for Location, Stone Code, DOC NO; BALANCE Weight bold in the detail; **Amount bold** in both tables; Profit/Loss regular weight (Total row: bold) |
| Captions (doc type, stone detail line, **price source**, "n without price") | 12 / 16, secondary |
| Numbers | right-aligned, `tabular-nums` |
| Font | existing IBM Plex Sans Thai (`--font-sans`) |

## Spacing, borders, radii (E)

| Item | Value |
|---|---|
| Card inner padding | 24 px |
| Toolbar control height | 36 px (`h-9`), gap 8–10 px; thin vertical dividers between the icon groups (new vs Stock Card, 1 px `gms-border`, 20 px high) |
| List row | 66 px; cells top-aligned (`py-2.5` or equal) |
| Detail row | 56 px; `pickerCell` padding `px-3 py-2`; the Price cell is a two-line block (number, caption) on a 56 px row (20 + 16 + padding fits) |
| Total row | about 40 px, 1 px top border, `#F9F9F9` |
| Header | two tiers 36 + 32 = 68 px; the last column (Profit/Loss) spans both tiers |

## Icons (C: `lucide-react`)

As Stock Card: `Columns3`, `Printer`, `FileSpreadsheet` (green), `RotateCw`, `ChevronLeft`, `SortIcon`, `Search`. No new icon.

## Colour is never the only signal

Group names (IN / OUT / BALANCE / Current value) are in the header text; the price source is **text** ("Price list", "Last sale", "No price"); a loss is a number with a minus sign and red; the ticked row also shows a tick.
