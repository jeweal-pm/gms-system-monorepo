# UI specification: stock-value

- Feature ID / revision: `stock-value` / **1**
- Status: **approved by direct instruction** (recorded in the [TODO](../../../task/todo/stock-value.md); see "Approval" there). No approval was set by `ui-spec`; the instruction is quoted as evidence.
- Owner request (2026-11-23, Thai, relayed by the parent in English): build the **Stock Value** report, the second item of Report › Stock Movement, now that Stock Card is built. Same chain as Stock Card: ui-spec, SA (ADR), frontend UI, backend API ("uxui ช่วยทำ ui spec ให้หน่อย sa ทำ adr เสร็จแล้ว frontend ทำ ui และ backend ทำ api").
- Source: five owner design images saved in [source/](source/) (originals 165–169; no Figma URL, so no Figma measurements exist). Stock Card precedent: [stock-card/ui-spec.md](../stock-card/ui-spec.md), implemented 2026-11-23 in `frontend/src/features/stock-card/**`.
- Main flow: [diagram/stock-value-flow.md](../../../diagram/stock-value-flow.md)
- Review bundle: this file, [open-questions](open-questions.md) (Q-SV-01…28), [design-system](design-system.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/stock-value-flow.md) and the [SA handoff](../../../coordination/handoffs/stock-value-sa.md). Central TODO: [`document/task/todo/stock-value.md`](../../../task/todo/stock-value.md).
- Inspection evidence (2026-11-23, branch `feat/23-11-26-stock-card`): every image viewed with the image viewer; colours and row/column edges read by scanning pixels with the project's `sharp` (the 1920 px screenshots are 1:1; the two row-state sheets are 3256 px wide, i.e. drawn at 2x, so heights below are halved). Code read: `frontend/src/features/{stock-card,trade-document/picker-ui.tsx,home/navigation.ts,memo-outstanding-vendor}`, `frontend/src/app/globals.css`, `frontend/src/lib/number-format.ts`, `backend-api-inventory/prisma/schema.prisma` (`stock`), `backend-api-auth/src/permission/catalog.ts`, and the Stock Card SA bundle under `document/apps/backend/inventory/stock-card/`.

## Source images

| ID | File | Original size | Shows |
|---|---|---|---|
| V1 | [V1-list-1920.png](source/V1-list-1920.png) (165-series: 167) | 1920 x 1080 | **List page**: one row, Total row, pager. Sidebar scrolled to Inventory/Sale, app tab "Stock Value" |
| V2 | [V2-detail-1920.png](source/V2-detail-1920.png) (168) | 1920 x 1080 | **Detail (transactions) page** of `AL-CU-3040-014`: header block, two rows, Total row |
| V3 | [V3-detail-annotated.png](source/V3-detail-annotated.png) (169) | 1041 x 652 | Figma-style annotated copy of V2. Only one annotation: "Page heading" (frame `20`) around the title row, which contains the back link, the stone-code title and the **Print and Excel icons at the right end of that row** |
| V4 | [V4-list-row-states.png](source/V4-list-row-states.png) (165) | 3256 x 562 | List row states: Default, Hover, Checkbox active |
| V5 | [V5-detail-row-states.png](source/V5-detail-row-states.png) (166) | 3256 x 344 | Detail row states: Default, Hover |

## Source quality and facts that change the request

Tags: **M** measured (pixel read by tool), **E** estimated from coordinates (about 2 px), **C** existing code or approved spec, **O** owner text, **A** assumption or recommended default. An **A** that changes behaviour is a question in [open-questions.md](open-questions.md).

| ID | Fact | Consequence |
|---|---|---|
| F-01 | All numbers are fake and inconsistent. The list row Amount is 47,120.00 while the Total Amount is 29,760.00 and the Total row shows an extra 47,120.00 under the Price/Unit area; the detail row 1 has BALANCE 4 pcs / 1.24 but Amount 0.00 and Profit & Loss −47,120.00; the pager says "1-12 out of 12 items" with pages up to 8; Stock IDs look like `STK-000214`; doc numbers `L2609014` / `IV2610015`. | None of these is a rule. Amounts and totals follow the owner's formula below; the pager follows the shared pager rules; doc captions and Stock IDs come from the server. |
| F-02 | "Invoice" appears as a document type (V2 row 2). No Invoice document exists. | Read as **Sale** (same decision as Q-SC-04); the caption always shows the server's real type label. |
| F-03 | Price, Amount and Profit/Loss exist only on this report. The owner gave the rules for Price and Amount (below) but **no formula for Profit/Loss**. | Profit/Loss is spec'd with a recommended default and can show "—" (Q-SV-07). |
| F-04 | The list columns are drawn **LOCATION, STONE CODE, LOT NO.** (V1); Stock Card has STONE CODE, LOCATION, LOT. The list search placeholder is "Search stone code, lot or vendor" (no Stock ID); the detail search box repeats the Stock Card list text "Search stone code, lot, vendor or stock ID" (copy-paste, as in Stock Card S6). | Follow the drawing for the column order and the list placeholder (Q-SV-12/13); the detail placeholder follows Stock Card's detail ("Search document no., stock ID or account"). |
| F-05 | The list row is **66 px** high (V1, V4) while Stock Card's list row is 56 px; detail rows are 56 px in both. | Follow the drawing for the list (room for the price-source caption); Q-SV-15. |
| F-06 | Three measured colour differences from what Stock Card ships: the blue "Current value" group does not exist yet; the BALANCE cell on **hover** is `#EDECF4` here but the shipped token is `#DDD7E4`; the BALANCE cell on a **ticked** list row is `#E6E7F0` here while Stock Card keeps `#F6F2FB`. | See "Comparison with Stock Card" and Q-SV-16. |
| F-07 | The group header text is drawn "Current value" (sentence case) while IN, OUT and BALANCE are upper case; the Profit/Loss header is "Profit/Loss" on the list and "PROFIT & LOSS" on the detail; its sort icon is drawn **before** the label. | Follow the drawing text per table; tiny, listed in Q-SV-14. |

No mobile or tablet design, no loading / empty / error screens, no print layout, no Customize-view layout and no Excel format were supplied. They follow Stock Card (**A**).

## Comparison with Stock Card (row states and tokens)

Compared with `frontend/src/app/globals.css`, `picker-ui.tsx` (`pickerRowClass`, `pickerGroupTone`, `pickerGroupHover`) and the Stock Card spec / design-system document.

| Item | V4 / V5 / V1 / V2 (M) | Shipped for Stock Card (C) | Result |
|---|---|---|---|
| Row default | `#FFFFFF`; 1 px `#EDEDED` between rows | `bg-white`, `border-gms-border` | same |
| Row hover (non-group cells) | `#F6FAFA` (list and detail) | `--color-gms-row-hover` `#F6FAFA` | same |
| Row ticked (non-group cells) | `#E5F3F2`, checkbox filled with a white tick | `--color-gms-row-active` `#E5F3F2` | same |
| Purple BALANCE cell, default | `#F6F2FB` | `--color-gms-group-purple-cell` `#F6F2FB` | same |
| Purple BALANCE cell, **hover** | **`#EDECF4`** (V4 list and V5 detail) | `--color-gms-group-purple-hover` `#DDD7E4` (measured from Stock Card S4) | **differs**: the Stock Value sheets are lighter. Q-SV-16 |
| Purple BALANCE cell, **ticked** | **`#E6E7F0`** (V4) | not tinted: the cell keeps `#F6F2FB` on a ticked row (Stock Card TC-SC-02) | **differs**: new token `--color-gms-group-purple-active` proposed |
| Green IN cell default / hover | `#EAF3EF` / `#DBE7E7` | token `#EEF7F2` (DS) / `--color-gms-group-green-hover` `#DBE7E7` | hover same; default is the known S8-versus-screenshot gap (Q-SC-18), keep the token |
| Orange OUT cell default / hover | `#FAF3E9` / `#EBE6DE` | token `#FDF6EE` (DS) / `--color-gms-group-orange-hover` `#EBE6DE` | hover same; default as above |
| **Blue "Current value"** head / sub / cell | `#C5D7F4` / `#DCE7F8` / `#F0F4FC` (V2) | **no blue group exists** | new tokens `--color-gms-group-blue-head / -sub / -cell` |
| Blue cell hover | `#E7EEF6` (V5) | none | new token `--color-gms-group-blue-hover` |
| Profit/Loss column (no group tint) | default white, hover `#F6FAFA`, ticked `#E5F3F2` (follows the row) | row classes | same, no new token |
| Total row | `#F9F9F9`, 1 px `#EDEDED` top border, about 38 px + border (V1, V2) | `#F9F9F9` token, 40 px | same |
| Negative Profit/Loss text | `#DF1016` (V1) | `--color-gms-danger` `#DF1016` | same, reuse the token |
| Header grey | `#E9EDED` | `--color-gms-table-head` | same |
| Purple group head in V1/V2 | `#E9DFF4` (head and sub identical) | DS `#DDCEEE` head, `#EBE1F5` sub | the known Q-SC-18 gap, keep the DS tokens |
| Header height | about 90 px | 68 px (36 + 32, DS) | known Q-SC-18 gap, keep 68 px |
| List data row height | 66 px (V1, V4: 40 -> 174 at 2x, minus border) | 56 px | **differs**, Q-SV-15 |
| Detail data row height | 56 px (V5) | 56 px | same |

If the owner prefers the Stock Card values, only the token values change. Nothing in Stock Card is edited by this feature unless the owner chooses it in Q-SV-16.

## Page structure and layout

Routes (**A**, mirrors Stock Card): list `/report/stock-movement/stock-value`, detail `/report/stock-movement/stock-value/[cardKey]`. `cardKey` is the **same opaque key Stock Card uses** for (stone code, location, lot) (`SC` + 32 hex), so a card has one identity in both reports. Both open in an app-shell tab titled "Stock Value" (V1/V2 tab bar, C ADR-0037). Breadcrumb on both pages: Home › Stock Movement › Stock Value (V1/V2, **M** text). Filters live in the URL search parameters (C, as Stock Card). The existing menu placeholder `/modules/stock-value` stays as the fallback href until the real route ships (see FE-SV-010).

### List page (V1)

```
[ Breadcrumb  Home › Stock Movement › Stock Value                                                          ]
[ Stock Value  (title)                                                                                      ]
[ white card                                                                                                ]
[  [Search stone code, lot or vendor] [All locations v] [Start -> Due]            [cols] | [print][xls] | [refresh]
[  table: [ ] #  LOCATION^v  STONE CODE^v  LOT NO.^v | BALANCE (purple): Pcs Weight Price Unit Amount | ^v Profit/Loss
[  rows 66 px ...                                                                                           ]
[  Total (grey)                                         sum   sum         .    .   sum                 sum ]
[  Showing 1-25 out of N items                                          [25 / page v] [<] 1 2 3 ... [>]    ]
```

| Region | Value | Evidence |
|---|---|---|
| Content card | white, radius about 12 px, left 260 / right 1895 at 1920, inner padding 24 px | E (V1), C (`gms-surface`, `radius-gms-lg`), same as Stock Card |
| Title | "Stock Value", 24 / 32, `text-gms-title`, medium | E (V1), C |
| Toolbar | Search 360 x 36 radius 8 (x 284–643); "All locations" select 136 x 36; Start -> Due range 189 x 36; tool icons right-aligned: columns, print, Excel (green), refresh, with thin vertical dividers between the groups (x about 1750 and 1834) | E (V1); the dividers are new compared with Stock Card (**A**: add them, 1 px `gms-border`, 20 px high) |
| Table | Card width (1588 px at 1920), x 284–1872. Header two tiers about 90 px drawn, **68 px built** (Q-SC-18 rule); data row **66 px**; Total row about 40 px; 1 px `#EDEDED` between rows | E / M |
| Column widths (E, V1) | checkbox about 36, `#` 48, LOCATION about 128, STONE CODE about 360, LOT NO. the remainder (about 360), BALANCE group 511 = Pcs 68 + Weight 128 + Price 128 + Unit 60 + Amount 127, Profit/Loss about 156 | E |
| Row content | All cells top-aligned (text baseline of line 1 at the same height in every cell, V1 y 349); STONE CODE has the stone-code line (bold, 14) and the detail line (12, secondary) | E (V1) |
| Footer | "Showing 1-N out of M items" left (12 px, secondary), page size select "25 / page" and pager right | E (V1), C (`Pager`) |

### Detail page (V2, V3)

```
[ Breadcrumb  Home › Stock Movement › Stock Value                                                          ]
[ ‹ Stock Value  /  AL-CU-3040-014 (title)                                                    [print][xls] ]
[ white card                                                                                               ]
[  +-------------------+---------------------+---------------------+                                      ]
[  | Stone Code        | Location            | Lot                 |    header block, same as Stock Card   ]
[  +-------------------------------------------------------------+                                        ]
[  | description strip                                            |                                       ]
[  [Search document no., stock ID or account] [Start -> Due]                                               ]
[  # DOC NO^v DATE^v STOCK ID^v Account^v | IN Pcs Wt | OUT Pcs Wt | BALANCE Pcs Wt | Current value Price Amount | ^v PROFIT & LOSS
[  rows 56 px; Price cell: number + price-source caption                                                   ]
[  Total                                    sums        sums         closing         price  amount            P/L ]
[  Showing 1-N out of M items                                          [25 / page v] [<] 1 2 3 ... [>]    ]
```

| Region | Value | Evidence |
|---|---|---|
| Title row ("Page heading", V3) | small teal back link "‹ Stock Value" (12 px, `gms-primary`), a "/" separator, then the stone code as the title (24 px). **Print and Excel icons at the right end of this row**; no columns or refresh icon (as Stock Card S6) | E (V2, V3), C |
| Header block | Identical to Stock Card: Stone Code / Location / Lot over three equal cells, description strip below (V2 shows `BKK-01` with a note "Vault · Bangkok"; Location is a name only, Q-SC-15, so one line) | E (V2), C `StockCardHeaderBlock` |
| Toolbar | Search 360 x 36 and Start -> Due 188 x 36; no location filter, no tool icons | E (V2) |
| Table | Two-tier header: left five columns (`#`, DOC NO, DATE, STOCK ID, Account) and the last column (PROFIT & LOSS) each span both tiers; groups IN green 194, OUT orange 193, BALANCE purple 193 (Pcs about 97 + Weight about 97), **Current value blue 256 (Price 128 + Amount 128)**; PROFIT & LOSS about 145 | E (V2) |
| Left column widths | `#` 48, DOC NO 140, DATE 100, STOCK ID 128, Account the rest (about 191); Account wraps to two lines (V2 row 1) | E (V2). Narrower than Stock Card's 200/128/200 because five more columns share the card; the table keeps `min-w-[1500px]` and scrolls sideways |
| Data rows | 56 px (V2: 459–514, 515–570); DOC NO bold with a 12 px type caption; Price cell is two lines (the number on line 1, the source caption on line 2, right-aligned); Amount bold; BALANCE weight bold | E (V2, V5) |
| Total row | about 40 px, label "Total" bold at DOC NO, `#F9F9F9`, 1 px top border, no group tint; values bold | M / E (V2) |
| Footer | Same pager as the list | E (V2), C |

Scroll and sticky (**A**, as Stock Card): the page scrolls vertically; the table scrolls sideways inside the card below about 1500 px (detail) / 1200 px (list), keeping `#` and the first text column sticky. No mobile layout is designed (Q-SV-26).

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-01 | Page shell, tab, breadcrumbs | `TabPage` in new routes (as `stock-card`) | breadcrumbs Home › Stock Movement › Stock Value | V1, V2 |
| C-02 | Search box, location select, Start -> Due, tool icons, error banner, empty card, skeleton | `features/stock-card/components/parts.tsx` (`SearchBox`, `LocationSelect`, `DateRange`, `ToolIcons`, `ErrorBanner`, `EmptyCard`, `TableSkeleton`) | reused as is; texts that say "Stock Card" are passed in or extracted (FE-SV-004) | V1, V2 |
| C-03 | Sort header cells | `SortTh`, `GroupSortTh`, `PlainTh` (`parts.tsx`) | the Profit/Loss header needs the sort icon **before** the label (prop) | V1, V2 |
| C-04 | List table | new `stock-value-table.tsx` on the picker table kit (`picker-ui.tsx`) | columns below; row states below | V1, V4 |
| C-05 | Transactions table | new `stock-value-transactions-table.tsx`, same kit, 4 groups | columns below | V2, V5 |
| C-06 | **Price cell** (number + source caption) | new `value-cells.tsx` | `price`, `unit`, `priceSource`, `priceSourceLabel`, `priceRef`; see "Price, Amount and Profit/Loss" | owner rule, V2 |
| C-07 | **Amount cell** and **Profit/Loss cell** | `value-cells.tsx` using `useNumberFormat().pricePlaces` | "—" when null; negative P/L in `text-gms-danger` | V1, V2 |
| C-08 | Back link, header block | `BackLink`, `StockCardHeaderBlock` (parametrized or extracted, FE-SV-004) | label "Stock Value", returns to `/report/stock-movement/stock-value` with its filters | V2 |
| C-09 | Pager | `Pager` (via the Memo Outstanding parts) | `PAGE_SIZES` 10 / 25 / 50, default 25 | V1, V2 |
| C-10 | Doc number link | `docHref` of `stock-card/model.ts` | same route map as Stock Card | V2 |
| C-11 | Customize view panel | `StockCardViewPanel` pattern with its own switches and storage key | Q-SV-22 | V1 |
| C-12 | Print view | pattern of `stock-card/components/print-view.tsx` | list: selected rows else the current page; detail: the current page; both with the Total row | Q-SV-18 |

### List table columns (V1)

| Column | Cell | Align | Sort | Evidence |
|---|---|---|---|---|
| (checkbox) | 20 px `pickerCheckbox`; header cell empty | center | none | V1, V4 |
| `#` | row number across pages `(page-1) x pageSize + n`, 14 px secondary | right | none | V1 |
| LOCATION | the Location name, bold, one line | left | `location` | V1 |
| STONE CODE | line 1 bold `stoneCode`; line 2 12 px secondary: `stone · shape size · color · clarity · cutting · quality` (empty parts dropped, `specLine` of Stock Card) | left | `stoneCode` | V1 |
| LOT NO. | the lot, or "—" when empty | left | `lot` | V1 |
| BALANCE (purple) **Pcs** | integer | right | none | V1 |
| BALANCE **Weight** | weight with `weightPlaces` (the unit is the Cts of the Unit column) | right | none | V1 |
| BALANCE **Price** | current unit price with `pricePlaces`; **source caption under the number** (below) | right | none | V1, owner rule |
| BALANCE **Unit** | "Cts" (price per carat, amount by weight); "Pcs" when every priced stock is per piece | left | none | V1 |
| BALANCE **Amount** | balance x price, bold, `pricePlaces` | right | none | V1 |
| Profit/Loss | `pricePlaces`, negative red, "—" when there is no value; header "Profit/Loss" with the sort icon before the label | right | `profitLoss` | V1 |

Default sort **A**: Stone Code ascending, then Location, then Lot (server-side, as Stock Card). Sorting is server-side (the list is paged). `profitLoss` sort puts "—" rows last in both directions.

### Detail table columns (V2)

| Column | Cell | Align | Sort | Evidence |
|---|---|---|---|---|
| `#` | row number | right | none | V2 |
| DOC NO | bold document number link + 12 px type caption ("Load to Stock", "Memo Out", …) | left | `docNo` | V2 |
| DATE | `dd/MM/yy` | left | `date` | V2 |
| STOCK ID | text, "—" when the server sends none (Memo Out), first + "+n" when several | left | `stockId` | V2 |
| Account | vendor or customer name, wraps | left | `account` | V2 |
| IN (green) Pcs / Weight | blank when the line is not an IN | right | none | V2 |
| OUT (orange) Pcs / Weight | blank when the line is not an OUT | right | none | V2 |
| BALANCE (purple) Pcs / Weight | running balance after the line, Weight bold | right | none | V2 |
| **Current value (blue)** Price | the card's current unit price with the source caption | right | none | V2 |
| **Current value** Amount | running BALANCE weight x current price, bold | right | none | V2 |
| PROFIT & LOSS | `pricePlaces`, negative red, "—" when there is no value; the sort icon is drawn before the label but **not built** (the SA detail sorts are `date docNo stockId account`, Q-SV-14) | right | none (drawn `profitLoss`, pending SA) | V2 |

Default order **A**: Date ascending then approval time (as Stock Card). Sorting another header reorders the rows; each row keeps its true running balance and its own value figures.

### Row and cell states

| State | Look | Evidence |
|---|---|---|
| Default | `#FFFFFF`; group cells tinted: IN `#EEF7F2`, OUT `#FDF6EE`, BALANCE `#F6F2FB` (existing tokens), **Current value `#F0F4FC` (new)** | M (V4, V5, V2), C |
| Hover (list and detail) | non-group cells `#F6FAFA`; tinted cells darker: IN `#DBE7E7`, OUT `#EBE6DE`, BALANCE existing `#DDD7E4` (sheet `#EDECF4`, Q-SV-16), Current value `#E7EEF6` (new) | M (V4, V5) |
| Ticked (list) | non-group cells `#E5F3F2`; BALANCE cells `#E6E7F0` (new token); checkbox filled `gms-primary-strong` with a white tick | M (V4) |
| Focus | existing `focusRing`; the whole list row is a focusable link target (Q-SC-16) | A |
| Disabled | not applicable | — |

Selection (list): ticking a row sets the ticked look; clicking the checkbox does not open the detail; selected rows are the print scope (Q-SC-09 carried over).

## Price, Amount and Profit/Loss

These rules come from the owner (`price`, `amount`) and from the recommended defaults (Q-SV-01…11). The server computes every value; the UI never multiplies or sums money. Amounts the UI shows are decimal strings from the API formatted with `useNumberFormat().pricePlaces` (Decimal Setup, default 2, ADR-0040); weights use `weightPlaces`.

Owner rules (O):

```
price:  current unit price. Under the number, show the source of the price.
        Price list = sell price of the Stock ID
        Last sale  = price from the latest Invoice, used when there is no Price list
amount: remaining quantity in Balance x current price. The unit cts is computed by weight.
```

### Price source caption

The caption sits **under the price number**, right-aligned with it, 12 / 16 (`text-gms-label`), `text-gms-text-secondary`. It is plain text, never colour alone.

| `priceSource` from the server | Price cell shows | Tooltip (`title`) |
|---|---|---|
| `PRICE_LIST` | the price and "Price list" | "Price list: sell price of the Stock ID" |
| `LAST_SALE` | the price and "Last sale" | "Last sale: latest Sale price" plus ` (SL2609001, 20/10/2026)` when the server sends `priceRef` |
| `NONE` (neither exists) | **"—"** and the caption "No price" | "No price list and no sale yet" |
| anything else (a value from a newer server) | the number and no caption | none |

The caption text is the server's `priceSourceLabel` ("Price list" / "Last sale"); the UI maps `priceSource` to the same words if the label is missing. There is no "Mixed" caption: SA revision 1 prices a multi-stock card with one quantity-weighted Price-list average (Q-SV-01), so one card has one source.

- **When neither exists:** Price "—" (caption "No price"), Amount "—", Profit/Loss "—". The row stays in the list (Q-SV-25): a stock without a price still has a balance the owner needs to see. The Total row counts only priced cards and says how many were left out (below).
- **Last sale** is only used when the card has no Price list at all; if both exist, the Price list wins (O). The UI does not decide this; it shows what `priceSource` says.
- Zero price: a price of 0 is not a price list (Q-SV-02); the server then falls back to Last sale and, failing that, `NONE`.
- The caption is a column of the Customize view ("Price source", Q-SV-22); hidden, the Price cell is the number only and the tooltip stays.

### Rounding and unit handling (cts by weight)

- **Unit:** the amount is computed **by weight**: `Amount = balance weight (cts) x price per ct`. The Unit column therefore shows **"Cts"** (`unit: "CT"`). Only when every priced Stock ID of the card is priced per piece does the server answer `unit: "PCS"`, value the card `pcs x price`, and the row shows Unit "Pcs" (SA decision SQ-SV-05, Q-SV-04). The UI renders `unit`; it does not convert. An unknown value renders "—".
- **Price** arrives with 4 places (`UnitPrice`) and is displayed with the Decimal Setup `pricePlaces` (default 2, display maximum 4). A weighted-average price of a card with several Stock IDs is therefore rounded for display only.
- **Amount** is rounded half away from zero to 2 places by the server from the unrounded `weight x price`. The UI shows the decimal string with `pricePlaces`; it never recomputes from the displayed price and weight (so `Price x Weight` may differ from `Amount` by a rounding step; this is expected and stated in the tooltip of the Amount header: "Balance weight x price, rounded by the system").
- **Total Amount** is the **sum of the cards' rounded Amounts** over the whole filtered set (not the page), so the Total reconciles with the rows when everything fits on one page.
- **Profit/Loss** uses the same rounding; formula in Q-SV-07 (default `Amount − cost of the remaining balance`, "—" when it cannot be computed).
- **Currency:** all money is in the company base currency (THB); a Last-sale price from a foreign-currency Sale is converted by the server with that document's exchange rate (Q-SV-03). No currency symbol is printed in cells (as the other reports).
- **Sign:** negative values show a minus sign; only **Profit/Loss** is coloured (negative `text-gms-danger` `#DF1016`, M V1). Positive and zero Profit/Loss use the normal text colour (the design shows no positive case, Q-SV-08). A negative Amount (negative balance, a data error) is shown as is.

### Total rows

- **List (whole filtered set, from the server, never the page rows):** Pcs sum, Weight sum, Price blank, Unit blank, Amount sum, Profit/Loss sum. A cell with nothing to show stays empty. When some filtered cards have no price the Amount cell shows a second line "n without price" (`totals.unpricedCards`, 12 px secondary); when priced cards have no cost the Profit/Loss cell shows "n without cost" (`totals.noCostCards`); Profit/Loss sums only the cards that have a value. The label is "Total" under the first text column.
- **Detail:** IN and OUT sums of the filtered rows, BALANCE = closing balance (Q-SC-07), Price = the card's current price (and caption), Amount = closing balance x price (equal to the card's Amount in the list at the same Due date), Profit/Loss = closing balance's Profit/Loss (Q-SV-09). Everything from the server.

## Behaviour

| Trigger | Result | Evidence |
|---|---|---|
| Open Report › Stock Movement › Stock Value | List loads, filters from the URL | V1 |
| Type in the search box | After 300 ms the URL `q` updates and the list reloads from page 1 | C |
| Choose a location / dates | URL updates, page 1; with a Due date the page shows the line "Balance as at dd/MM/yyyy at current prices" above the table (Q-SV-06) | V1 |
| Sort Location / Stone Code / Lot No. / Profit/Loss | server-side sort, page 1 | V1 |
| Click a list row (not the checkbox) | Opens the detail of that card; list filters survive Back | V4 (row open), Q-SC-16 |
| Click "‹ Stock Value" | Returns to the list with its previous filters | V2 |
| Click DOC NO | Opens that document's own page; not the row | Stock Card S7 (O) |
| Print | Browser print: list = selected rows if any else the current page; detail = the current page; includes the Total row | Q-SV-18 |
| Excel | `aria-disabled`, tooltip "Excel export isn't available yet" (Q-SV-17) | C |
| Refresh | refetches (list), spinner while loading | V1 |
| Columns button | opens the Customize view panel | V1 |
| Hover a price caption / Amount header | tooltip as above | A |

The document-type route map is Stock Card's ([ui-spec](../stock-card/ui-spec.md#document-types-and-route-map-a-sa-confirms-in-the-handoff)); the card's lines are the same ledger as Stock Card, so the same documents appear.

## States

| State | Behaviour |
|---|---|
| Access | Needs the Stock Value VIEW grant (leaf `stock-value`, existing). Without it: "You don't have access to Stock Value". PRINT hides the print icon; Excel is shown `aria-disabled` |
| Loading | List: skeleton table of 8 rows, header visible. Detail: skeleton header block + skeleton rows |
| Empty (no stock) | "No stock to show." / with filters "No stock matches these filters." + Clear filters |
| Empty detail | "No transactions in this period." (filters) or "No transactions." The header block still shows |
| Error | Banner "Couldn't load Stock Value." + Retry (keeps filters); detail not found: "This stock card no longer exists." + link "Back to Stock Value" |
| Partial | **None.** Prices are read in the same statement as the balances (SA revision 1), so there is no balances-without-prices state; a failure is the normal error banner (Q-SV-27) |
| Permission lost during use | FORBIDDEN, page shows the no-access text |

## Interaction and data

Data per page: [data-fetching.md](data-fetching.md), adopted from the SA revision 1 contract ([api-contract](../../backend/inventory/stock-value/api-contract.md), [ADR-0057](../../../adr/0057-stock-value-report-in-inventory-service.md); reconciliation in the [handoff](../../../coordination/handoffs/stock-value-sa.md)). No Stock Value API is implemented yet (checked `backend-api-inventory/src/modules`; the Stock Card routes return no price). Independent UI work (tokens, value cells, model, routes, table components, navigation) can start now against typed fixtures **only inside tests**; no mock data ships in a page.

## Dependencies and traceability

[dependencies.md](dependencies.md): **no new package**. TODO IDs FE-SV-001…014 and BE-SV-001…006 in [the TODO](../../../task/todo/stock-value.md); SA IDs SA-SV-01…10 in [the SA handoff](../../../coordination/handoffs/stock-value-sa.md) and the SA bundle [inventory/stock-value](../../backend/inventory/stock-value/decisions.md).
