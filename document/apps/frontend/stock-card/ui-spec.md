# UI specification: stock-card

- Feature ID / revision: `stock-card` / **1**
- Status: **pending-review** (approval fields unset; see the [TODO](../../../task/todo/stock-card.md))
- Owner request (2026-11-23, Thai, relayed by the parent in English): the Report › Stock Movement menu changes from "Primary Stock / Consignment Stock" to two items, **Stock Card** and **Stock Value**. Only **Stock Card** is built now. The list reports, per stone code (+ location + lot), the **pcs and total weight (cts) remaining (BALANCE)**. Clicking a row opens the transactions of that stone code with **IN, OUT and BALANCE (running)** and totals.
- Source: eight owner design images saved in [source/](source/) (originals 152, 153, 154, 155, 156, 157, 158, 164; 159–163 are repeats). No Figma URL, so no Figma measurements exist.
- Main flow: [diagram/stock-card-flow.md](../../../diagram/stock-card-flow.md)
- Review bundle: this file, [open-questions](open-questions.md) (Q-SC-01…24), [design-system](design-system.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/stock-card-flow.md) and the [SA handoff](../../../coordination/handoffs/stock-card-sa.md). Central TODO: [`document/task/todo/stock-card.md`](../../../task/todo/stock-card.md).
- Inspection evidence (2026-11-23, branch `feat/23-11-26-stock-card`): all images viewed one by one; colours read by sampling pixels with the project's `sharp`; positions read from the 1920 px screenshots. Code read: `frontend/src/features/{memo-outstanding-vendor,purchase-outstanding,trade-document,home,load-to-stock}`, `frontend/src/app/globals.css`, `frontend/src/components/ui/*`, `backend-api-inventory/prisma/schema.prisma` (`stock`, `stock_movement`), `backend-api-auth/src/permission/catalog.ts`, `backend-api-master/src/document-setup/document-setup.transactions.ts`.

## Source images

| ID | File | Original size | Shows |
|---|---|---|---|
| S1 | [S1-list-2100.png](source/S1-list-2100.png) | 2100 x 1177 | List page with the sidebar scrolled to Report › Stock Movement › **Stock Card** (active) and **Stock Value** |
| S2 | [S2-list-row-states.png](source/S2-list-row-states.png) | 3256 x 556 | List row states: Default, Hover, Checkbox active |
| S3 | [S3-back-button.png](source/S3-back-button.png) | 320 x 216 | Back button "‹ Stock Movement", Default and Hover (pill `#E2F0F0`) |
| S4 | [S4-detail-row-states.png](source/S4-detail-row-states.png) | 3256 x 344 | Detail row: Default and Hover (tinted IN / OUT / BALANCE cells) |
| S5 | [S5-list-1920.png](source/S5-list-1920.png) | 1920 x 1080 | List page |
| S6 | [S6-detail-1920.png](source/S6-detail-1920.png) | 1920 x 1080 | Detail page of `AL-CU-3040-014` |
| S7 | [S7-doc-no-link-note.png](source/S7-doc-no-link-note.png) | 1122 x 455 | Owner note (Thai): "if the text link is clicked, go to that document's detail page" |
| S8 | [S8-table-design-system.png](source/S8-table-design-system.png) | 2800 x 5762 | The shared table design system (row states, 6 column-group colours, row height); the same sheet the picker kit follows (design 136) |

## Source quality and open decisions

Each value carries a tag.

- **M**: measured, a pixel colour read from the image by tool.
- **E**: estimated from screenshot coordinates (the 1920 px images are 1:1 pixels, so these are good to about 2 px). Not Figma values.
- **DS**: written on S8.
- **C**: existing code or approved spec (the reused pattern).
- **O**: owner text or note.
- **A**: assumption or recommended default. An **A** that changes behaviour is a question in [open-questions.md](open-questions.md).

Facts that change the request's premise (C):

| ID | Fact | Consequence |
|---|---|---|
| F-01 | The approved `lot-based-stock` bundle ([TODO](../../../task/todo/lot-based-stock.md), Q-LOT-10 / 10a) says the **Stock ID is shown nowhere and is not searchable**. S1/S5/S6 show a **STOCK ID** column and the search placeholder "Search stone code, lot, vendor or stock ID". | Conflict: Q-SC-01. The column and the search term are isolated in one TODO item (FE-SC-009) so either answer is cheap. |
| F-02 | The design's Stock IDs look like `STK-000214`; real Stock IDs are `YY####` (`stock.stock_id`, 10 chars). Doc numbers `L2609014`, `MO2609021`, `MR2610003`, `IV2610015` also differ from the Document Setup defaults (Load to Stock `LS`, Memo Out `MO`, Memo Out Return `MOR`, Memo Receive `MR`, Memo Return `MRT`, Sale `SL`). There is **no "Invoice" document**. | The images are mock data. Doc type captions come from the server, not from the number. "Memo Return" with IN and a customer as Account behaves like **Memo Out Return**; "Invoice" like **Sale**. Confirm: Q-SC-04. |
| F-03 | The Location master is **Name only** (`location-master`, ADR-0053). S5/S6 show a code `BKK-01` with a second line `Vault · Bangkok`. | Only the name exists as data. Default: one line, the Location name (Q-SC-15). |
| F-04 | The pager in S5 reads "Showing 1-12 out of 12 items" with pages 1 2 3 … 8 (and "25 / page"), and the list shows 12 rows with stone codes repeated and every Lot `L-2609-014` and Balance Cts `0.62`. | Mock data. The pager follows the shared pager rules, not those numbers. |
| F-05 | The sidebar permission leaves `stock-movement-primary` / `stock-movement-consignment` exist (auth catalog). No `stock-card` / `stock-value` leaf exists. | Menu rename needs SA/auth work (**requires-sa**, Q-SC-14). |
| F-06 | S3 labels the back button "‹ Stock Movement"; the full-page S6 shows a small teal "‹ Stock Card" link before the title. | Q-SC-13. Default follows S6 (the page that was drawn in full). |

No mobile or tablet design, no loading / empty / error screens, no print layout, no column-visibility panel and no Excel format were supplied. They are **A** items, not invented design.

## Page structure and layout

Routes (**A**): list `/report/stock-movement/stock-card`, detail `/report/stock-movement/stock-card/[cardKey]` (`cardKey` is an opaque key the list returns, so stone code + location + lot never need URL-escaping rules in the UI). Both open in an app-shell tab titled "Stock Card" (S5/S6 tab bar, C ADR-0037). Breadcrumb on both pages: Home › Stock Movement › Stock Card (S5/S6, **M** text). Filters live in the URL search parameters (C, as Memo Outstanding).

### List page (S5, S1)

```
[ Breadcrumb  Home › Stock Movement › Stock Card                                                     ]
[ Stock Card  (title)                                                                                 ]
[ white card                                                                                          ]
[  [Search stone code, lot, vendor or stock ID] [All locations v] [Start -> Due]      [cols][print][xls][refresh]
[  table: [ ] #  STONE CODE ^v   LOCATION ^v   LOT ^v   | BALANCE (purple) Pcs  Cts                   ]
[  rows 56 px ...                                                                                     ]
[  Showing 1-25 out of N items                                      [25 / page v] [<] 1 2 3 ... [>]   ]
```

| Region | Value | Evidence |
|---|---|---|
| Content card | white, radius about 12 px, left 260 / right 1895 at 1920 (24 px inside the page), inner padding 24 px | E (S5), C (`gms-surface`, `radius-gms-lg`) |
| Title | "Stock Card", 24 px / 32 px, `text-gms-title`, medium weight, `text-gms-text-heading` | E (S5), C |
| Toolbar | Search 360 x 36 radius 8; "All locations" select about 136 x 36; Start -> Due range about 188 x 36; gap 8–10 px; tool icons right-aligned: columns, print, Excel (green), refresh | E (S5) |
| Table | Full card width (1588 px at 1920). Header two tiers about 90 px in S5/S6 (S8 §4 says 68 px, see Q-SC-18); body rows **56 px** (E: row pitch 56 px in S5, matches S8 §4 **DS**); no row divider colour change; 1 px `gms-border` between rows | E / DS |
| Column widths | checkbox about 36, `#` about 26, STONE CODE about 480, LOCATION about 316, LOT about 309, BALANCE group about 411 (Pcs, Cts right-aligned, each about 205) | E (S5) |
| Footer | "Showing 1-N out of M items" left (12 px, secondary); page size select "25 / page" and pager right | E (S5), C (`Pager`) |

### Detail page (S6)

```
[ Breadcrumb  Home › Stock Movement › Stock Card                                                      ]
[ ‹ Stock Card  /  AL-CU-3040-014 (title)                                                  [print][xls]]
[ white card                                                                                           ]
[  +-------------------+---------------------+---------------------+                                  ]
[  | Stone Code        | Location            | Lot                 |   three header cells, one row   ]
[  | AL-CU-3040-014    | BKK-01 Vault·Bangkok| L-2609-014          |                                  ]
[  +-------------------------------------------------------------+                                    ]
[  | Alexandrite · Cushion 3.0 x 4.0 mm · Light Blue · AAA · VS1  |   description line               ]
[  [Search ...] [Start -> Due]                                                                         ]
[  # DOC NO ^v | DATE ^v | STOCK ID ^v | Account ^v | IN Pcs Weight | OUT Pcs Weight | BALANCE Pcs Weight]
[  1 L2609014  04/09/26  STK-000214  Bangkok Gem...   4  1.24 |          |   4  1.24                   ]
[    Load to Stock                                                                                     ]
[  ...                                                                                                 ]
[  Total                                              6  1.86 |  4  1.24 |  2  0.62                   ]
[  Showing 1-4 out of 4 items                                      [25 / page v] [<] 1 2 3 ... [>]    ]
```

| Region | Value | Evidence |
|---|---|---|
| Title row | small teal back link "‹ Stock Card" (12 px, `gms-primary`), a "/" separator, then the stone code as the page title (24 px). Print and Excel icons at the right of this row (no columns / refresh in S6) | E (S6) |
| Header block | One bordered box (1 px `gms-border`, radius about 8) about 1588 x 116: top row 76 px with three equal cells (529 px) separated by 1 px lines; each cell has a 12 px grey label ("Stone Code", "Location", "Lot") over a 24 px semibold value; Location shows the value plus a 12 px secondary note beside it; bottom strip 40 px with the description, 14 px | E (S6) |
| Toolbar | Search 360 x 36 and Start -> Due (188 x 36), same controls as the list; no location filter, no tool icons | E (S6) |
| Table | Two-tier header: left four columns with a single header cell spanning both tiers; IN (green), OUT (orange), BALANCE (purple) groups each 200 px wide (Pcs 100 / Weight 100) | E (S6), DS |
| Left column widths | `#` 48, DOC NO 200, DATE 128, STOCK ID 200, Account the rest (about 411) | E (S6) |
| Data rows | **56 px**: line 1 values 14 px; DOC NO is **bold** with a 12 px secondary line under it (doc type caption); numbers right-aligned in 100 px cells; BALANCE values bold | E (S6), DS |
| Total row | about 40 px, label "Total" bold at the DOC NO column, IN / OUT / BALANCE totals right-aligned, 1 px top border, plain `#F9F9F9` background (**M**) with no group tint | E / M (S6) |
| Footer | The same pager as the list ("Showing 1-4 out of 4 items", "25 / page") | E (S6), C |

Scroll and sticky (**A**, C pattern of `outstanding-table`): the page scrolls vertically as a whole; the table has a minimum width of about 1100 px and scrolls sideways inside the card on narrower windows, keeping `#` + first text column sticky. No mobile layout is designed.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-01 | Page shell, tab, breadcrumbs | `TabPage` (`features/home/tabs/tab-host`) in a new route | `breadcrumbs`; Suspense fallback "Loading…" | S5, C `purchase-outstanding` route |
| C-02 | Search box | The search input of `Filters` (`memo-outstanding-vendor/components/filter-bar.tsx`), debounced 300 ms, `SEARCH_MAX` | placeholder per page; clear button | S5, S6 |
| C-03 | "All locations" select | Single-select dropdown styled like the Vendor popover / `SelectField`; options from `options.locations` (Location master, ADR-0053) | "All locations" (none) or one name; **A**: single select (Q-SC-05) | S5 |
| C-04 | Start -> Due range | `DateInput` + `dateRangeProblem` (`filter-bar.tsx`) | two inputs with an arrow; `Start` / `Due` placeholders; Due before Start shows the existing inline problem text | S5, S6 |
| C-05 | Tool icons | `IconButton`, `PrintExcel`, columns icon (`Columns3`), refresh (`RotateCw`) of the Memo Outstanding toolbar | Print needs PRINT grant; Excel `unavailableReason` (Q-SC-11); columns opens a panel (Q-SC-12); refresh spins while fetching | S5 |
| C-06 | Report table, list | New `stock-card-table.tsx` on the **picker table kit** (`trade-document/picker-ui.tsx`: `pickerCell`, row states, group tones) plus `SortIcon` | columns below; sortable headers; row states below | S5, S2, S8 |
| C-07 | Report table, detail | New `stock-card-transactions-table.tsx`, same kit, 3 column groups and a Total row | columns below | S6, S4, S8 |
| C-08 | Back link | New small `Link` with chevron, hover pill `#E2F0F0` (**M**, S3) | Default text `gms-primary`; Hover pill, radius about 8; focus ring | S3, S6 |
| C-09 | Header block (Stone Code / Location / Lot) | New `stock-card-header.tsx`, plain markup on tokens | loading skeleton; not-found state | S6 |
| C-10 | Pager | `Pager` (`memo-outstanding-vendor/components/parts.tsx`) with `PAGE_SIZES` 10 / 25 / 50, default 25 | `page`, `pageSize`, `total` | S5, S6 |
| C-11 | Doc number link | `next/link` to the document route; bold text, hover underline | per-doc-type route map | S6, S7 |
| C-12 | Empty / error / skeleton | `EmptyState`, error banner with Retry, `TableSkeleton` of the Memo Outstanding page (extract to shared, or copy the markup) | see States | C |
| C-13 | Print view | Pattern of `print-view.tsx` + `print.module.css` (hidden on screen, shown by `window.print`) | header with filters + printed time; table rows | **A** (Q-SC-11) |

### List table columns (S5)

| Column | Cell | Align | Sort | Evidence |
|---|---|---|---|---|
| (checkbox) | 20 px checkbox, `pickerCheckbox`; no header checkbox (header cell empty, E S5) | center | none | S5, S2 |
| `#` | row number across pages (`(page-1) x pageSize + n`), 14 px secondary | right | none | S5 |
| STONE CODE | line 1 bold 14 px `stoneCode`; line 2 12 px secondary details: `stone · shape size · color · clarity · cutting · quality` (empty parts dropped, `itemSpecParts` rule) | left | `stoneCode` | S5 |
| LOCATION | line 1 bold the location; line 2 secondary (none by default, Q-SC-15) | left | `location` | S5 |
| LOT | line 1 the lot (or "—" when empty); line 2 secondary vendor name | left | `lot` | S5 |
| BALANCE group (purple) | two sub-columns **Pcs** (integer) and **Cts** (weight, `useNumberFormat().weightPlaces`), Cts bold | right | `balancePcs`, `balanceWeightCt` on the sub-header | S5 |

Default sort **A**: Stone Code ascending, then Location, then Lot (stable, server-side). Sorting is server-side (the list is paged).

### Detail table columns (S6)

| Column | Cell | Align | Sort | Evidence |
|---|---|---|---|---|
| `#` | row number | right | none | S6 |
| DOC NO | bold document number as a link; 12 px secondary caption = document type label ("Load to Stock", "Memo Out", …) | left | `docNo` | S6, S7 |
| DATE | document date `dd/MM/yy` (S6 "04/09/26"); the existing report date is `dd/MM/yyyy` (`formatDate`), see Q-SC-23 | left | `date` | S6 |
| STOCK ID | text; empty when the line has none or several (Q-SC-01) | left | `stockId` | S6 |
| Account | counter-party name: vendor (Load to Stock, Memo Receive, Memo Return), customer (Memo Out, Memo Out Return, Sale) | left | `account` | S6 |
| IN (green) Pcs / Weight | integer / weight; blank when the line is not an IN | right | none | S6 |
| OUT (orange) Pcs / Weight | blank when the line is not an OUT | right | none | S6 |
| BALANCE (purple) Pcs / Weight | running balance after the line, Weight bold | right | none | S6 |

Default order **A**: Date ascending, then the document's approval time (the running balance only makes sense chronologically). Sorting by another header reorders the rows but each row keeps its true running balance, so the column is not meaningful then; this is acceptable and stated in Q-SC-22.

### Row and cell states

| State | Look | Evidence |
|---|---|---|
| Default | `#FFFFFF`; group cells tinted: IN `#EAF3EF`, OUT `#FAF3E9`, BALANCE `#F6F2FB` | M (S4, S6); S8 (DS) writes `#EEF7F2` / `#FDF6EE` / `#F6F2FB` for the 8 % cells (Q-SC-18) |
| Hover (list and detail) | non-group cells `#F6FAFA` (M); tinted cells get darker: IN `#DBE7E7`, OUT `#EBE6DE`, BALANCE `#DDD7E4` | M (S2, S4) |
| Active / Checkbox active (list) | `#E5F3F2`, checkbox filled `gms-primary-strong` with a white tick | M (S2), DS |
| Focus | existing `focusRing`; the whole list row is a focusable link target (Q-SC-16) | A |
| Disabled | not applicable | — |

Selection (list, **A** Q-SC-09): ticking a row sets the Checkbox-active look; clicking the checkbox does not open the detail. Selected rows are the print scope.

## Behaviour

| Trigger | Result | Evidence |
|---|---|---|
| Open the menu item Report › Stock Movement › Stock Card | List loads, filters from the URL | S1 |
| Type in the search box | After 300 ms the URL `q` updates and the list reloads from page 1 | C |
| Choose a location / dates | URL updates, page 1 | S5 |
| Click a list row (not the checkbox) | Opens the detail of that stone + location + lot in the same app tab flow (route push); the list filters survive Back | S2 "Active" (DS: click row opens details), A |
| Click "‹ Stock Card" | Returns to the list with its previous filters (URL kept); Q-SC-13 | S6 |
| Click DOC NO | Opens that document's own detail page (`/memo/memo-out/[id]` etc.); not the row | S7 (O) |
| Print | Browser print of the current filter and page (list: selected rows if any) | Q-SC-11 |
| Excel | disabled, tooltip "Excel export isn't available yet" | Q-SC-11, C |
| Refresh | refetches the list or detail, spinner while loading | S5 |
| Column button | opens the view panel (Q-SC-12) | S5 |

### Document types and route map (**A**, SA confirms in the handoff)

| Doc type label | Route | IN / OUT |
|---|---|---|
| Load to Stock | `/inventory/load-to-stock/[id]` | IN |
| Memo Receive | `/memo/memo-receive/[id]` | IN (Memo Stock) |
| Memo Out Return | `/memo/memo-out-return/[id]` | IN |
| Memo Out | `/memo/memo-out/[id]` | OUT |
| Memo Return | `/memo/memo-return/[id]` | OUT (back to the vendor) |
| Sale | `/sale/sale/[id]` | OUT |

Reserve and Quotation do not move stock and are not shown. Merge/Split, Stock Transfer Location and Stock Adjustment are placeholders today; they join the list when they exist (the table renders any label the server sends). See Q-SC-03/04.

## States

| State | Behaviour |
|---|---|
| Access | Needs the Stock Card VIEW grant (assumed leaf `stock-card`, requires-sa). Without it: "You don't have access to Stock Card" (as the other reports). PRINT hides the print icon; EXCEL is unavailable anyway. |
| Loading | List: skeleton table of 8 rows, header visible. Detail: skeleton header block + skeleton rows. |
| Empty (no stock) | "No stock to show." with the card; when filters are active "No stock matches these filters." with Clear filters |
| Empty detail | "No transactions in this period." (filters active) or "No transactions." Header block still shows. |
| Error | Banner "Couldn't load Stock Card." + Retry (keeps filters); detail not found / wrong key: "This stock card no longer exists." + link back |
| Partial | If the server reports one source (own stock or Memo Stock) as unavailable, a banner "Some stock couldn't be loaded" and the rows that did load (**A**; only if SA keeps two sources, SA-SC-01) |
| Permission lost during use | the server returns FORBIDDEN, page shows the no-access text |

## Interaction and data

Data per page: [data-fetching.md](data-fetching.md). Assumed contract names are written there for SA to align or replace. Everything is **requires-sa**: no stock-card API exists today (checked `backend-api-inventory/src/modules`, `backend-api-master`). Independent UI work (tokens, table components, routes, pager reuse, page shell) can start after approval against typed fixtures only inside tests; no mock data ships in the page (the repository rule of Q-PU-01).

## Dependencies and traceability

[dependencies.md](dependencies.md): **no new package**. TODO IDs FE-SC-001…014 in [the TODO](../../../task/todo/stock-card.md); SA IDs SA-SC-01…14 in [the SA handoff](../../../coordination/handoffs/stock-card-sa.md).
