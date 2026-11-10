# UI specification: approve-center revision 1

- Feature ID / revision: `approve-center` / 1
- Status: **approved** 2026-11-07 (owner in chat, "อนุมัติ เริ่มทำเลย"; answers to Q-AP-01/02/03 in [open-questions](open-questions.md)); phase 1 implemented 2026-11-07 ([central TODO](../../../task/todo/approve-center.md))
- Owner request (2026-11-07, verbatim): "uxui ช่วยเขียนสเปค … ของ Approve … หน้า Approve นี้จะเป็นหน้าที่ Approve แต่ละ transaction โดยจะมี Quotation, Reserve, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location และพวก memo (ยกเว้น memo outstanding)". The owner also wants frontend to build a first UI right after this spec.
- Sources (owner GMS design, 3840×2160 PNG = 1920×1080 CSS px at 2×, desktop only):
  - [source/01-approve-quotation-empty.png](source/01-approve-quotation-empty.png), SHA-256 prefix `c5c815f5e9f55f83`: Approve › Quotation, empty state, Quotation item marked "off".
  - [source/02-approve-reserve-pending.png](source/02-approve-reserve-pending.png), SHA-256 prefix `c9632928512deaa8`: Approve › Reserve, two pending rows.
- Inspection evidence: both PNGs opened in the image viewer and sampled pixel-by-pixel (System.Drawing) on 2026-11-07. Values marked **measured** are pixel samples ÷ 2; **estimated** values are read by eye. No Figma file was supplied, so no exact font metrics, hover/focus states or mobile layouts exist.
- Main flow: [diagram/approve-center-flow.md](../../../diagram/approve-center-flow.md)
- Review bundle: this file, [design-system.md](design-system.md), [conventions.md](conventions.md), [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md), [form-guidelines.md](form-guidelines.md), [dependencies.md](dependencies.md), [testing.md](testing.md), [open-questions.md](open-questions.md); SA request [coordination/handoffs/approve-center-sa.md](../../../coordination/handoffs/approve-center-sa.md). Central TODO: [task/todo/approve-center.md](../../../task/todo/approve-center.md).
- No new package.

## What Approve is

One page where an approver sees every document **waiting for approval** (`PENDING_APPROVAL`) and approves it without opening each document page. It is a second-level menu (one item per document type) with one table per item.

Facts from the code (verified 2026-11-07, `backend-api-master/src/master/router.ts`, `prisma/schema.prisma`):

| Menu item | Document today | Pending state | Approve procedure | Party | Document page |
|---|---|---|---|---|---|
| Quotation | exists; **created `APPROVED`** (`quotation.service.ts` create), so nothing is ever pending | n/a in the UI (the enum still has `DRAFT / PENDING_APPROVAL / APPROVED / REJECTED / CANCELLED`) | `quotation.approve`, `reject`, `cancel`, `submit` exist but are unused by the UI ("Quotation has no approval", owner 2026-10-26) | customer | `/pre-sale/quotation/[id]` |
| Reserve | exists | `PENDING_APPROVAL → APPROVED` | `reserve.approve` (`reserve:APPROVE`) | customer | `/pre-sale/reserve/[id]` |
| Purchase Order (PO) | exists | `PENDING_APPROVAL → APPROVED` | `purchaseOrder.approve` | vendor | `/purchase/purchase-order/[id]` |
| Purchase | exists | `PENDING_APPROVAL → APPROVED` | `purchase.approve` | vendor | `/purchase-order/purchase/[id]` |
| Load to Stock | **no page, no API** | unknown | none | unknown | none |
| Merge/Split Stock | **no page, no API** | unknown | none | unknown | none |
| Transfer Location | **no page, no API** | unknown | none | unknown | none |
| Memo Receive | exists | `PENDING_APPROVAL → APPROVED` | `memoReceive.approve` | vendor | `/memo/memo-receive/[id]` |
| Memo Return | exists | `PENDING_APPROVAL → APPROVED` | `memoReturn.approve` | vendor | `/memo/memo-return/[id]` |
| Memo Out | exists | `PENDING_APPROVAL → APPROVED` | `memoOut.approve` | customer | `/memo/memo-out/[id]` |
| Memo Out Return | exists | `PENDING_APPROVAL → APPROVED` | `memoOutReturn.approve` | customer | `/memo/memo-out-return/[id]` |

- Memo Outstanding (Vendor / Customer) and Purchase Outstanding are reports and are **excluded** (owner text).
- Soft delete (ADR-0045): every `list` defaults to `deleted: false`, so deleted documents never appear. Approve Center never sends `deleted: true`.
- **Reject / Revise do not exist** on any document in use. Only Quotation has `reject` (to `REJECTED`, with a reason) and nothing has "revise". The design's Reject… and Revise… buttons are therefore an **owner decision** (Q-AP-01, Q-AP-02) and need SA; see [Actions](#actions).
- Sale is not in the owner's list (Q-AP-08).

## Source quality and open decisions

- Measured (pixel samples): colors, divider thickness, button/badge/search/row sizes listed in [design-system.md](design-system.md).
- Estimated: font sizes and weights (they match the existing `gms-title` 24 px, `gms-heading` 16 px, `gms-body` 14 px, `gms-label` 12 px), radii, paddings smaller than 4 px.
- Design-only data: the rows (RS2611002 / RS2611003, customers, amounts) and the counts (Reserve 2, PO 2, Purchase 1, Load to Stock 1, Merge/Split 2) are sample content. Load to Stock and Merge/Split cannot have pending documents today.
- Inconsistencies found:
  - The sidebar Approve badge reads **10**, but the visible menu counts add to **8** (Q-AP-05).
  - The value reads "172,020.00 **USB**"; the currency code is `USD`. Spec uses the document's currency code.
  - The Action header has a sort icon; sorting by action has no meaning (Q-AP-11, default: no sort).
  - The Pending badge text `#FFAB00` on `#FFE7B8` has about 1.6:1 contrast, below WCAG AA (Q-AP-12).
  - The sidebar in source 02 has green / orange / red / pink dots on almost every item, and faint pink dots on the Inventory items in source 01. They read as the designer's progress annotations and are **not implemented** (same family as app-navigation Q-NAV-06).
  - Source 02 shows the expanded sidebar *and* the Approve panel side by side. The existing context panel (Setup › Partner master) pairs with the collapsed rail. This spec follows the design (Q-AP-10).
  - The design's menu does not list the memo documents; the owner's text adds them. Placement default: after Transfer Location (Q-AP-03).
- Not supplied: loading, error, no-permission, bulk-selection, confirm dialogs, Reject/Revise dialogs, mobile/tablet, hover/focus. Everything below for those states is a **default** marked as such.

## Route and navigation

- Routes: `/approve` and `/approve/[menu]`, `menu` ∈ `quotation · reserve · purchase-order · purchase · load-to-stock · merge-split · transfer-location · memo-receive · memo-return · memo-out · memo-out-return`. An unknown slug shows the standard "Menu not found" placeholder.
- `/approve` opens the first visible menu item that has pending documents, else the first visible item (default, Q-AP-04).
- Sidebar Approve (`approveLink`, today `/modules/approve`) links to `/approve` and stays active on `/approve/*`.
- Breadcrumb: Home › Approve › {menu label} (source 01/02).
- Page title (`<h1>`): the menu label (source: "Quotation", "Reserve").
- The app-shell tabs (ADR-0037) treat each `/approve/[menu]` as a normal page.

## Page structure and layout (1920 × 1080 desktop)

```
[ main sidebar 236 | Approve panel 236 | topbar 48: breadcrumb … clock · flag · bell · fullscreen · avatar      ]
[                  | Approve           | <h1> {Menu}                                                            ]
[                  | ▸ Quotation   off | ┌ card ─────────────────────────────────────────────────────────────┐  ]
[                  | ▸ Reserve      2  | │                                         [🔍 Search no., …     ]   │  ]
[                  | ▸ Purchase Or. 2  | │ ☐ # Document Detail            Qty   Value Submitted Status Action│  ]
[                  | ▸ Purchase     1  | │ ☐ 1 RS…      Siam Gems…      2 pcs  …USD  Mint(Sales) Pending [R][V][A]│  ]
[                  | ▸ Load to Stock   | │ … rows or empty state …                                         │  ]
[                  | ▸ Merge/Split     | │                                                                 │  ]
[                  | ▸ Transfer Loc.   | └─────────────────────────────────────────────────────────────────┘  ]
[                  | ▸ Memo Receive …  |                                                                       ]
```

- **Main sidebar** (existing, 236 px, `#FCFCFC`, 1 px `#EDEDED` right border): Approve item active (`#F3F3F3`) in source 01; in source 02 Home is shaded instead, which is treated as a design slip (Approve is the current route).
- **Approve panel** (new, follows `SidebarContextPanel` styling): 236 px wide (measured), `#FCFCFC`, 1 px right border; title "Approve" `gms-heading` semibold; items 36 px high (measured), 8 px inset each side (measured: item 220 px wide), 8 px gap (estimated), radius 8 px, icon 18 px + label `gms-body`, count badge right-aligned. Active item `#F3F3F3` with `#1C252E` text; others `#1C252E` (sampled).
- **Content**: `#F9F9F9` page background, 24 px left padding (measured), title 24 px semibold, then a white card (1 px `#EDEDED` border, measured; radius 12 px estimated) filling the remaining height.
- **Card**: 16 px inner padding (measured right; top ~19 px measured, use 16 + the 36 px search row). Search field 360 × 36 px (measured), right-aligned, 1 px `#EDEDED` border, radius 8 px, search icon left, placeholder `#ADB1B4`.
- **Table**: starts 16 px below the search (estimated). Header row `#F9F9F9` (measured), ~55 px, 2 px `#EDEDED` bottom border (measured 4 device px); body rows 56 px (measured), 1 px `#EDEDED` dividers (measured). The table scrolls inside the card; the header stays sticky (default).
- **Responsive (default, not in design)**: ≥ 1280 px as above. 1024–1279 px: the main sidebar uses its existing collapsed rail, Approve panel stays. < 1024 px: the Approve panel becomes a full-width menu select above the title; the table scrolls horizontally with the Action column sticky to the right. No mobile card layout in revision 1 (Q-AP-10).

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| C-AP-01 | Sidebar Approve item + total badge | `features/home/navigation.ts` `approveLink`, `sidebar.tsx` (no badge support yet) | href `/approve`, activePrefix; badge = total pending (hidden when 0, loading or error; `99+` cap) | 01/02 left, "10" pill 26 × 20 px, `#E2F0F0` bg, `#1C7B80` text (measured) |
| C-AP-02 | Approve panel | new `ApprovePanel`, styled like `sidebar-context-panel.tsx` | items, active, per-item badge state (count / off / none) | 01/02 second column |
| C-AP-03 | Panel item badge | new | `count` (20 × 20 circle, `#E2F0F0`/`#1C7B80`, measured), `off` (text "off", `#656B71`, 1 px border, pill, estimated), none | "2", "1", "off" |
| C-AP-04 | Page header | `TabPage` breadcrumbs + `<h1>` | label | 01/02 |
| C-AP-05 | Search field | reuse the list search used by Memo Outstanding / Quotation lists (outlined field + lucide `Search`) | placeholder per menu, debounce 300 ms, max 100 chars, clear on Esc | 01/02 top right |
| C-AP-06 | Approval table | new `ApprovalTable` (semantic `<table>`), `checkbox.tsx`, `sort-icon.tsx` | columns per menu (below), rows, selection, sort, loading/empty/error/permission | 02 |
| C-AP-07 | Document cell | new | doc no. link (`#006A70`, underlined, measured) + doc date `dd/mm/yy` (`gms-label`, `#656B71`) | 02 "RS2611002 / 01/11/26" |
| C-AP-08 | Detail cell | new | party name (`gms-body`) + sub line (`gms-label`, `#656B71`) | 02 |
| C-AP-09 | Qty cell | new | right-aligned `{pcs} pcs` / `{weight} cts`, tabular numbers, Decimal Setup places (ADR-0040) | 02 "2 pcs / 2.33 cts" |
| C-AP-10 | Value cell | new | right-aligned `{grandTotal} {currency}`, 2 dp | 02 "172,020.00 USB" |
| C-AP-11 | Submitted cell | new | `{name} ({role})` + `dd/mm/yyyy HH:mm` (Asia/Bangkok) | 02 "Mint (Sales) 01/11/2026 11:20" |
| C-AP-12 | Status badge | existing status tone map (`PENDING_APPROVAL` in `features/trade-document`) | "Pending", 60 × 24 px (measured), bg `#FFE7B8` (measured), text see Q-AP-12 | 02 |
| C-AP-13 | Row actions | `button.tsx` | Reject… (outline `#DF1016`), Revise… (outline `#FFAB00`), Approve (filled `#006A70`, white text); each ~95 × 36 px (measured), ~9 px gap (measured); disabled = `#F8F8F8` bg, `#A9A9A9` text, no border + 14 px info icon `#DF1016` (measured) at the top-right | 02 |
| C-AP-14 | Empty state | new (reuse the empty-state pattern of the reports if one exists) | tray icon ~48 px `#ADB1B4`, title "Nothing waiting" `gms-heading` semibold, text "Every document in this menu has been reviewed." `gms-body` `#656B71`, centered ~100 px below the header | 01 |
| C-AP-15 | Bulk bar | new (**default, not in design**) | "{n} selected", Approve selected, Clear selection | — |
| C-AP-16 | Confirm dialog | `confirm-dialog.tsx` | title, message, confirm label, busy | — (default) |
| C-AP-17 | Toast | `toast.tsx` | success / error | — (existing) |

## Columns

Every menu uses one column set. Widths are measured from source 02 at 1920 px and become min-widths; Detail takes the remaining space.

| # | Column | Content | Align / width | Sort |
|---|---|---|---|---|
| 1 | ☐ | row checkbox; header checkbox = all loaded rows (indeterminate when some) | 32 px | — |
| 2 | # | running number of the loaded rows | 32 px | — |
| 3 | Document | doc no. link → document page; doc date below | left, ~124 px | doc no. |
| 4 | Detail | party name; sub line per menu (below) | left, flexible | party name |
| 5 | Qty | `{Σ pcs} pcs` / `{Σ weight} cts` | right, ~120 px | Σ weight |
| 6 | Value | `{grandTotal} {currency}` | right, ~200 px | grand total (within one currency; mixed currencies sort by code then amount) |
| 7 | Submitted | `{user} ({role})` / datetime | left, ~145 px | datetime |
| 8 | Status | Pending badge | left, ~130 px | — (all rows are pending; Q-AP-11) |
| 9 | Action | Reject… · Revise… · Approve | left, ~320 px | — (Q-AP-11) |

Default order: **oldest submitted first** (source 02 lists 01/11 before 02/11; approvers work first-in first-out). Q-AP-11.

### Per-menu variants (Detail sub line and party)

| Menu | Party (line 1) | Sub line (line 2) | Status |
|---|---|---|---|
| Reserve | customer | `Hold until {dueDate dd/mm/yy} · {n} line(s) · {stone names}` | **from design** |
| Memo Out | customer | `Due {dueDate} · {n} line(s) · {stone names}` | default |
| Memo Out Return | customer | `{n} line(s) · {stone names}` | default |
| Memo Receive | vendor | `Due {dueDate} · {n} line(s) · {stone names}` | default |
| Memo Return | vendor | `{n} line(s) · {stone names}` | default |
| Purchase Order (PO) | vendor | `Due {dueDate} · {n} line(s) · {stone names}` | default |
| Purchase | vendor | `{n} line(s) · {stone names}` | default |
| Quotation | customer | `Valid until {dueDate} · {n} line(s) · {stone names}` | default; normally empty ("off") |
| Load to Stock | **provisional**: location | `{n} line(s) · {stone names}` | provisional (no page) |
| Merge/Split Stock | **provisional**: `Merge {n} → 1` / `Split 1 → {n}` | source Stock IDs | provisional (no page) |
| Transfer Location | **provisional**: `{from location} → {to location}` | `{n} line(s) · {stone names}` | provisional (no page) |

- Stone names: distinct stone names of the lines in line order, at most 3, then `+{k}` (default). Line count uses "line" / "lines".
- Value for the provisional inventory menus may be "—" (stock moves have no price); decided when those pages are designed.
- The search placeholder follows the party: "Search no., customer, stone, Stock ID" (design) or "Search no., vendor, stone, Stock ID" for vendor documents. Provisional menus: "Search no., stone, Stock ID".

## Menu item states

| State | Badge | Click | Table area |
|---|---|---|---|
| Has pending documents | count (`99+` cap) | opens the menu | rows |
| No pending documents | none | opens | empty state (source 01 text) |
| **off** — approval not required (Quotation; Q-AP-06) | "off" | opens | empty state, same text (source 01) |
| **Not available yet** — no document page (Load to Stock, Merge/Split Stock, Transfer Location) | none (the design's 1 / 2 are sample data) | opens | header row with the provisional columns + empty state "Not available yet / {Menu} approvals will appear here once its page is built." (default, Q-AP-07) |
| Count loading / failed | none | opens | the table's own state |
| No APPROVE grant | item hidden | — | — |

Panel order (owner Q-AP-03, 2026-11-07: the sidebar order): Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location. Icons reuse the main sidebar icons of the same document (`nav-icons.tsx`).

The sidebar Approve badge is the sum of the visible items' counts (Q-AP-05). The badge refreshes on page focus and after any approval (see [data-fetching.md](data-fetching.md)).

## Table states

| State | Display |
|---|---|
| Loading (first page) | header row + 5 skeleton rows (56 px, `#F3F3F3` bars); search stays usable |
| Loading more | "Load more" button shows a spinner; rows stay |
| Empty (no pending) | C-AP-14 with source 01 text |
| Empty search result | same tray, title "No matching documents", text "Try another document no., {party}, stone or Stock ID." + Clear search (default) |
| Error | inline in the card: "Couldn't load {Menu} approvals." + Retry; keeps the previous rows if any (default) |
| No VIEW on that document | "You don't have permission to view {Menu} documents." (APPROVE without VIEW; default) |
| Partial (bulk) | failed rows stay with an inline reason under the action buttons (see [error-handling.md](error-handling.md)) |

Pagination: 50 rows per request (the list API maximum), "Load more" below the table, "Showing {loaded} of {total}" (default). All counts come from the server `total`.

## Actions

### Approve (one row)

- Enabled with `<menu leaf>:APPROVE`; otherwise hidden (default).
- Opens the confirm dialog (default; the design shows none, Q-AP-09). Title "Approve {docNo}?"; message = the same consequence sentence as the document page (for example Reserve: "Its N stock items are held for the customer and it can no longer be edited."). Buttons Cancel / Approve.
- On success: the row leaves the table, the menu and sidebar counts drop by one, toast "{docNo} approved".
- On failure: the row stays; the message is shown under the row's actions and in an error toast (see [error-handling.md](error-handling.md)). Stock-shortage failures (`*_PENDING_SHORT`) say "Open the document to fix it" with the link.
- Double-submit protection: the button shows a spinner and the row's actions are disabled while the request runs.

### Bulk selection and Approve selected (default, not in design; Q-AP-09)

- Row checkboxes are enabled only where Approve is enabled. Header checkbox selects every loaded selectable row; indeterminate when some are selected.
- With ≥ 1 selected, a bulk bar replaces the empty left side of the search row: "{n} selected · [Approve selected] · Clear".
- Approve selected → confirm "Approve {n} documents?" → documents are approved **one at a time** in table order (no parallel burst; 4 GB / 2 vCPU budget). A progress line reads "Approving {i} of {n}…". Cancel stops before the next document.
- Result: toast "Approved {ok} of {n}"; succeeded rows leave; failed rows stay selected with their reason.
- Selection clears when the menu, search or sort changes, and after a refresh removes the selected row.
- No bulk Reject / Revise.

### Reject… and Revise… (owner decision; requires SA)

- No document in use supports them. Revision 1 renders both buttons as in the design but **disabled** with the info icon and tooltip "Reject is coming soon" / "Revise is coming soon" until SA delivers contracts. Owner answers 2026-11-07: Reject = final REJECTED status with a required reason (Q-AP-01); Revise = back to the creator with a note, then resubmitted (Q-AP-02).
- The ellipsis implies a dialog with a reason. When defined, the dialog is expected to be: title "Reject {docNo}?" / "Send {docNo} back for revision?", a required reason (1–500 chars, as `quotation.reject`), Cancel / Reject (danger) or Send back (warning). This is recorded so the UI can be built quickly once approved; it is **not** an approved behaviour.
- The design's disabled Revise on row 2 has an unexplained per-row reason (Q-AP-02).

### Document link

Opens the document page (`/…/[id]`) in the app-shell tab system; the document page keeps its own Approve button. Returning to Approve refreshes the list (focus refetch).

## Permissions

- Approve panel item visible when the user has `<leaf>:APPROVE` (`quotation`, `reserve`, `purchase-order`, `purchase`, `load-to-stock`, `merge-split`, `stock-transfer-location`, `memo-receive`, `memo-return`, `memo-out`, `memo-out-return`); Super Admin / ALL sees all. Default (Q-AP-13).
- Sidebar Approve visible when at least one panel item is visible (today it is always shown because "approve" has no catalog leaf).
- The server checks `APPROVE` (+ CSRF) on every approve call; the UI check is only for display.

## Dependencies and traceability

- Packages: none ([dependencies.md](dependencies.md)).
- Phase 1 (independent UI): FE-AP-001…008 in the [central TODO](../../../task/todo/approve-center.md), using the existing per-document `list` / `get` / `approve` procedures; cells the API cannot fill show "—".
- Phase 2 (requires SA): SA-AP-01…05 in the [SA handoff](../../../coordination/handoffs/approve-center-sa.md) — one approval summary/count call, enriched pending-list rows (version, line count, stone names, Σ pcs/weight, submitter name/role, submitted time), stone/Stock ID search, Reject/Revise, and later the inventory documents.

## Revision 2: document preview modal

- Revision: UI 2 (TODO revision 2; no SA revision). Status: **approved** 2026-11-10 (owner, AskUserQuestion "Approve and start", after Q-AP-20/21 answers).
- Owner request (2026-11-10, verbatim): "frontend backend ตอนนี้หน้า approve เมื่อกดหมายเลข transaction จะขึ้น modal มาเป็นข้อมูลของ ใบ transaction นั้นๆ".
- Sources (owner design PNGs, 2026-11-10):
  - [source/03-document-modal.png](source/03-document-modal.png), 1141×1010, SHA-256 prefix `7c519fc99cb46341`: the modal alone (Reserve RS2611002).
  - [source/04-document-modal-on-page.png](source/04-document-modal-on-page.png), 2108×1192, SHA-256 prefix `60ba8e1d0bf097e2`: the modal over Approve › Reserve; the purple note "ตัวอย่างที่ 2 เลือกกดปุ่มในคอลัมน์ Action" is a design annotation, not UI.
- Owner answers 2026-11-10: Q-AP-17 value in THB as designed; Q-AP-18 Reject…/Revise… disabled as in the table; Q-AP-19 modal only (no way to open the full page from Approve); Q-AP-20 "Ordered by" + customer name; Q-AP-21 line-sum total. See [open-questions](open-questions.md).
- **No backend change.** Every field comes from the existing per-document `get` (shared document engine `toDetail`, verified 2026-11-10 in `backend-api-master/src/trade-document/document-engine.ts`); Purchase and Purchase Order use the same engine. Phase 2 (ADR-0046) stays on hold.

### Trigger

- The Document cell's number (C-AP-08) becomes a link-styled **button** that opens the modal for that row. It no longer navigates to `/…/[id]` (Q-AP-19, replaces [Document link](#document-link)).
- A row error's "Open {docNo}" link (stock shortage) also opens the modal.
- Keyboard: Enter/Space on the number opens it; focus returns to the number on close.

### Layout (source 04 is the reference; source 03 differs only in where the badge sits)

| Area | Content |
|---|---|
| Header | Badge "Pending approval" (C-AP-12 tones); title `{menu label}  {docNo}` (`gms-heading` semibold); sub line `Submitted by {name} ({role}) · {dd/MM/yy HH:mm} · waiting {n} day(s)`. Phase 1 has no submitter (Q-AP-14), so it reads `Last saved {dd/MM/yy HH:mm} · waiting {n} day(s)`; under one day "waiting {h} h", under one hour "waiting < 1 h". Close ✕ top right. |
| Fields | Doc Date (`dd/MM/yy`); **Customer** or **Vendor** by menu (the design's "Supplier" on a Reserve is a placeholder; Reserve has a customer); Currency `USD · rate 36.20`, or only the code when the document is in the company currency. |
| Lines table | `#`, Stone code, Stone, Pcs, Weight, Value ({company currency}), Location; one row per line in document order; light grey header (`gms-page`), white rows, 1 px row dividers, rounded border. |
| Total row | Σ Pcs, Σ Weight (`cts`), Σ Value of the lines; grey background. |
| Grand total | Only when the document grand total differs from the line sum (discount, tax, charges, labour): one right-aligned line under the table, `Grand total {value}` in the same currency. |
| Document Note | Heading "Document Note"; the note with line breaks kept; empty → "No note". |
| Footer | Close (secondary), Reject… and Revise… (disabled, info icon + the table's tooltips, Q-AP-18), Approve (primary). |

- Size: width min(1086 px, 100vw − 32 px); height ≤ 90vh; the header and footer stay fixed and the body scrolls. Overlay `rgba(0,0,0,0.4)`.

### Line cells

| Column | Value |
|---|---|
| Stone code | `stoneCode`; memo lines without a stone code show the Stock ID; neither → "—". Semibold. |
| Stone | `{stone} {shape} {size}` (empty parts skipped). Customer documents (Reserve, Memo Out, Memo Out Return): column sub-header **"Ordered by"** and, under each stone, the document's customer name (Q-AP-20, owner 2026-11-10). Vendor documents (Memo Receive, Memo Return, PO, Purchase): no sub-header and no sub line. |
| Pcs | integer, right-aligned. |
| Weight | decimal-setup weight places + " cts", right-aligned. |
| Value | line `amount` × document `exchangeRate`, rounded half-up to the price places; no rate (document in the company currency) → `amount`. Header names the company currency (THB today). Semibold, right-aligned (Q-AP-17). |
| Location | `location`; memo receive lines have none → "—". |

### States

| State | Behaviour |
|---|---|
| Loading | Header shows the row's docNo at once; body shows 5 skeleton rows; Approve disabled. |
| Loaded | As above. Data is the `get` result, refetched each time the modal opens (no stale document). |
| Load failed | "Couldn't load {docNo}." + Try again; Approve disabled. |
| No longer pending | `get` returns another status, or NOT_FOUND / `_DELETED`: "{docNo} is no longer waiting for approval." Approve hidden; closing refreshes the list. |
| Approving | Approve opens the same confirm as the row (Approve one); on success the modal closes, the row leaves, counts drop, toast "{docNo} approved". On failure the modal stays open and shows the message above the footer. |

- Approve from the modal sends the **version the modal loaded**, so the approver approves exactly what they saw. An edit made meanwhile fails with the existing "changed" message and Try again reloads it. (This closes [INV-20261107-001](../../../task/investigation/INV-20261107-001-approve-center-approves-unreviewed-version.md) for the modal path; the row's Approve button is unchanged.)
- Approve shows only with `<leaf>:APPROVE` (same as the row). The modal itself needs the list's `<leaf>:VIEW`, which the row already implies.

### Accessibility

`role="dialog"`, `aria-modal="true"`, labelled by the title, described by the sub line; focus starts on Close; Tab stays inside; Esc closes; the background is inert. The lines table is a real `<table>` with a caption ("{docNo} lines", visually hidden).

### Revision 2 TODO

FE-AP-013…016 in the [central TODO](../../../task/todo/approve-center.md).
