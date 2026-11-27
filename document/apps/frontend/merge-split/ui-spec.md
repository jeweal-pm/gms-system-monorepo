# UI specification: merge-split

- Feature ID / revision: `merge-split` / **1**
- Status: **pending-review** (draft for owner review; not approved). Open questions Q-MS-01…16 carry recommended defaults ([open-questions](open-questions.md)).
- Owner request (2026-11-27, verbatim): "ช่วยเขียน UI spec ของ Merge/Split ... หน้าตา UI จะเหมือนหน้า Load โดยที่จะเป็นหน้าที่ Merge หรือ split ของในคลังของตัวเอง โดยที่มีปุ่ม 1 ปุ่มคือปุ่ม from stock จะเปิดมาจะเป็นของของคลังเราเอง"
- Source: **no Merge/Split design**. The layout is the Load to Stock design (owner images 176–191, session attachments, not copied; 186 "None", 189 "Merge" opened for reference 2026-11-27) and the implemented page `frontend/src/features/load-to-stock/**` (C). Every Merge/Split-specific value below is **A** (assumption) or **O** (owner text).
- Evidence tags: **O** owner text; **C** existing code / approved spec / ADR; **E** estimated from the Load images; **A** assumption (listed in open-questions).
- Main flow: [diagram/merge-split-flow.md](../../../diagram/merge-split-flow.md)
- Review bundle: this file, [open-questions](open-questions.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [design-system](design-system.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/merge-split-flow.md). Central TODO: [`document/task/todo/merge-split.md`](../../../task/todo/merge-split.md). SA bundle (written concurrently): `document/apps/backend/inventory/merge-split/` + ADR in `document/adr/`.

## What the page does

A Merge/Split document converts **our own stock** (stock already loaded by Load to Stock, `inventory.stock`) into new stocks (O):

- **Split**: one source stock → N new stocks (N ≥ 2, Q-MS-04).
- **Merge**: N source stocks (N ≥ 2) → one new stock.
- **None is not offered** (Q-MS-03): a 1 → 1 conversion with no change is a no-op; a location move belongs to Stock Transfer Location, a quantity change to Stock Adjustment.

One mode per document, as Load (C, Q-LS-07). Each new stock gets a new Stock ID; the consumed source quantity leaves the source Stock ID. Memo Stock (vendor goods) and Purchase lines never appear (O).

## Page structure (mirrors Load to Stock, C)

Route `/inventory/merge-split` (new) and `/inventory/merge-split/[id]` (saved). Breadcrumb **Home › Inventory › Merge/Split**. The sidebar placeholder `link("merge-split", "Merge/Split", SplitVerticalIcon)` gets `REAL_PAGE_HREFS["merge-split"]` + `activePrefix` (C `navigation.ts`, shared file). App-shell tab titled with the document number (C, ADR-0037).

```
[ Breadcrumb Home › Inventory › Merge/Split                                                      ]
[ "Merge/Split No.:" MSGMS2611001 [status chip]                 Print Excel Duplicate Refresh    ]
[                                       [+ Create New] [Cancel] [Save] [Edit] [Delete] (+Send)   ]
[ card: Doc Date* | Ref.                                                                         ]
[ card: Item  N stocks [From Stock] [scan]                                                       ]
[       Item table (picked source stocks, read-only)                                             ]
[ ─────────── divider ───────────                                                                ]
[ Result  N rows  (chip: Split · one stock into several | Merge · stocks into one)   rail ▢ ▢   ]
[ Photo box | Result table (Split: grouped per source + "+ Split" · Merge: one row) + Totals    ]
[ Document Note | Summary (source vs result totals)                                              ]
```

Header card has only **Doc Date \*** and **Ref.** (A, Q-MS-12): Load's Vendor/Currency do not apply to own stock; cost is in the company currency (THB).

## Component inventory

| ID | Component | Reuse (C) | Rule |
|---|---|---|---|
| H-01 | "Merge/Split No.:" + number | `QuotationHeader` | New: grey preview from Document Setup key `merge-split` (default code **MS**, C `document-setup.transactions.ts`). Saved: issued number + status chip (ADR-0050 D6) |
| H-02 | Print, Excel | `QuotationHeader` | **Print enabled** for saved, non-deleted documents (browser print of the read-only view, A Q-MS-13); Excel disabled as Load |
| H-03 | Duplicate | `DocumentForm` | Disabled: sources are bound to current on hand (as Load H-03) |
| H-04 | Refresh | `DocumentForm` | Reload; confirm when dirty |
| H-05 | Create New / Cancel / Save / Edit / Delete / Send to approve | `QuotationHeader` + `approval-flow.tsx` (`useApprovalSetting("merge-split")`) | ADR-0050 as Load. Leaf `merge-split` VIEW/ADD/EDIT/DELETE (C auth catalog) |
| I-01 | Doc Date * | `FormDateInput` | Default today |
| I-02 | Ref. | `TextInput` ≤ 100 | Optional |
| T-01 | "Item  N stocks" | title | Count of picked source stocks |
| T-02 | **From Stock** (dark) | Load's source button | The only source button (O). Opens P-01. First pick into an empty Result table opens P-02 |
| T-03 | Scan icon | `IconButton` | Disabled placeholder (C, all transaction pages) |
| T-04 | Item table (sources) | `load-source-table.tsx` pattern | Columns IT-1…10; read-only; a source is removed from the Result table (group trash / Merge row source list) |
| R-01 | "Result  N rows" + mode chip | Load mode chip | Chip "Split · one stock into several" / "Merge · stocks into one" |
| R-02 | Photo box + Item Note | `ItemPhotoBox` | Selected result row's photos (≤ 5) and note; initial photos copied from the source stock (Split) or the suggested source (Merge) (A, Q-MS-11) |
| R-03 | Result table — **Split** | `load-table.tsx` + `split-group-row.tsx` | Group row per source; children = new stocks; "+ Split" adds a child |
| R-04 | Result table — **Merge** | `load-table.tsx` | One result row; no empty rows (Load Q-LS-15) |
| R-05 | Totals row | Load Totals | Result Pcs, Weight, Amount |
| R-06 | Row ⊖ remove / checkbox + "Remove N selected" | Load | Split: removing children (≥ 2 must remain per group, S-04); Merge: not shown on the single row |
| R-07 | More `…` → row panel | `ItemEditorShell` shared with Quotation (C, Load `load-row-panel.tsx`) | Fields M-01…M-11 |
| R-08 | Right rail | `RailButtons` | Daybook and Summary (Summary shows source vs result totals, S-06) |
| N-01 | Document Note | `DocumentNote` 250 | As Load |

### Item table columns (T-04), one row per source stock

| # | Header (sub) | Format |
|---|---|---|
| IT-1 | # | Row number |
| IT-2 | Stone Code (Stock ID · Lot) | Bold stone code; **Stock ID** badge + Lot (Q-MS-01); note line "Loaded {LS no.} · {dd/MM/yy}" |
| IT-3 | Location | Stock location |
| IT-4 | Stone (Shape · Size) | Text |
| IT-5 | Color · Clarity (Cutting · Quality) | Text |
| IT-6 | Cer Type (Cer No.) | Chip / "No certificate" |
| IT-7 | Pcs | **Available** on hand when picked |
| IT-8 | Weight (ct) | Available weight, Decimal Setup places |
| IT-9 | Price (Unit) | Unit cost THB, sub "per ct" / "per pcs" |
| IT-10 | Amount | Cost amount THB of the available quantity |

### Result table columns (R-03 / R-04)

| # | Header (sub) | Format / edit |
|---|---|---|
| RT-1 | ☐ / ⊖ | Checkbox, red remove (Split children only) |
| RT-2 | # | Within group (Split) |
| RT-3 | Stone Code (Stock ID · Lot) | Stone code; badge "**Stock ID on save** Auto" until issued, then the issued Stock ID; note "From {source Stock ID}" (Merge: "From {id} + {id} …", ≤ 3 then "+n") |
| RT-4 | Location * | `Select location` portal select (C Load `LT-5`), Location Master active names. Split: defaults to the source location; Merge: empty until chosen (Q-MS-07) |
| RT-5 | Stone (Shape · Size) | Text; editable in the panel |
| RT-6 | Color · Clarity (Cutting · Quality) | Text; editable in the panel (grading, Q-MS-06) |
| RT-7 | Cer Type (Cer No.) | Chip; editable in the panel |
| RT-8 | Pcs | Split: integer ≥ 1, editable; Merge: Σ source pcs, locked |
| RT-9 | Weight (ct) | Split: > 0, editable; Merge: Σ source weight, locked |
| RT-10 | Price (Unit) | Read-only unit cost THB (C-01/C-02) |
| RT-11 | Amount | Read-only cost amount THB |
| RT-12 | More | `…` opens R-07 |

### Split group row (R-03)

As Load S-01 (C): chevron · group number · bold "{Stock ID} · {Stone} {Shape} {Size}"; sub grading · Lot · Cer. Middle "→ {n} locations", "{n} new stocks". Right "{pcs} pcs · {weight} cts" (source available) and a **balance chip**: green "Balanced" when Σ children = source pcs **and** weight, else orange "Left {pcs} pcs · {ct} ct" / red "Over by …". Actions **+ Split** (new child prefilled with the source details and the remaining quantity) and trash (removes the source and its children, confirm).

### Row panel (R-07) "More"

| ID | Field | Rule |
|---|---|---|
| M-01 | Stock ID | Read-only "Auto" until issued |
| M-02 | Lot | Prefilled from the source (Merge: suggested source); editable ≤ 40 (A, Q-MS-06) |
| M-03 | Location * | Portal select as RT-4 |
| M-04 | Stone Code, Stone, Shape, Size, Color, Clarity, Cutting, Quality | Stone Master selects; prefilled; editable (Q-MS-06) |
| M-05 | Cer Type, Cer No. | Prefilled; editable |
| M-06 | Pcs, Weight (ct) | Split editable; Merge locked |
| M-07 | Price Unit | Read-only: source unit (Split); Merge rule C-02 |
| M-08 | Price (cost) | Read-only unit cost THB |
| M-09 | Stock Price * | Prefilled from the source (Merge: suggested source); required ≥ 0 (A, Q-MS-10) |
| M-10 | Sale Price * | As M-09 |
| M-11 | Note, Photos ≤ 5 | Item note; photos per R-02 |

## Dialogs

### P-01 Add From Stock (own stock only)

- Reuses `MemoStockModal` with a new prop variant `source: "merge-split"` (as Stock Adjustment did, C FE-SAJ-004). Title "Add From Stock"; Esc / ✕ close; focus returns to T-02.
- **Granularity: one row per individual own Stock ID** (decision Q-MS-01). Reason: Merge and Split consume and create Stock IDs, so the user must see which stock is converted. Own stock already has one lot key per Stock ID (ADR-0055, lot_key `OS`+id; C Stock Adjustment ui-spec), so this is the same row set the lot picker returns for own stock; only the Stock ID is additionally displayed.
- Rows: own stock, any location, **available on hand > 0**. Quantities held by Reserve, Memo Out (and sold/consumed) are not available: `available = on_hand` bucket only; a fully held stock does not appear; a partly held stock shows only its on-hand part (Q-MS-02). Excludes stocks already on this document and stocks on another **Pending** Merge/Split (Q-MS-15).
- Tools: search (Stock ID, stone code, lot, cer no.; debounced 250 ms) and a Location filter (All / one).
- Columns: ☐ · # · Stone Code (**Stock ID** · Lot) · Location · Stone (Shape · Size) · Color · Clarity (Cutting · Quality) · Cer Type (Cer No.) · **Avail. Pcs** · **Avail. Weight** · Cost (unit THB, per ct/pcs) · Sale Price · Amount (cost THB).
- Paged 50, Load more (C). Footer Cancel / **OK** (disabled until ≥ 1 ticked). OK → P-02 on the first pick; later picks reuse the mode (Split: new groups; Merge: sources join the row) with toast "Added with mode {mode}".
- States: loading; empty "No own stock available"; error + Retry; own stock service down → error (no Memo Stock fallback here).

### P-02 Mode — "How should these stocks be converted?"

Load's mode dialog (C `load-mode-dialog.tsx`) with two radio cards only:

1. **Split · one stock into several** — "Each picked stock becomes 2 or more new stocks. Pcs and weight must add up to the stock. Cost follows weight (per pcs pricing: pcs)." Always enabled.
2. **Merge · stocks into one** — "N stocks → 1 new stock · {Σpcs} pcs · {Σct} ct · average {x} THB per {unit}. Suggested details come from the most expensive stock per piece: {line} ({Stock ID}, {THB per pc}). Choose location and grading." Disabled with reason "Pick at least 2 stocks to merge" when fewer than 2 picked.

Default selection: Split when 1 stock is picked, Merge when ≥ 2 (A). Footer **Back to list** / primary "Create N rows" (Split: 2 children per source, quantities prefilled per S-02; Merge "Create 1 row"). Toast "Added N rows".

## Calculations (preview in the browser, server authoritative)

- **C-01 Split cost.** Source unit cost `u` (THB per ct or per pcs) is kept. Child cost = child weight × `u` (per ct) or child pcs × `u` (per pcs). The **last child** absorbs the rounding difference so Σ child cost = consumed source cost exactly (A, Q-MS-05).
- **C-02 Merge cost (weighted average).** Result cost = Σ source cost amounts (each = available qty × its `u`). Result unit = per ct unless **every** source is per pcs (Load Q-LS-27, C). Result unit cost = Σ cost ÷ Σ weight (per ct) or ÷ Σ pcs (per pcs). Example: A 2.00 ct × 10,000 = 20,000; B 3.00 ct × 15,000 = 45,000 → 65,000 ÷ 5.00 ct = **13,000 THB per ct**. Shown in P-02 and as the RT-10 sub-line "average of N stocks".
- **C-03 Suggested details (Merge).** From the source with the highest THB cost **per piece** (cost amount ÷ pcs; tie → first picked), as Load's Merge text (C Q-LS-27): stone code, stone, shape, size, grading, cer, lot, stock/sale price, photos. Location starts empty.
- Decimal-safe arithmetic only (existing trade-document decimal utilities, C).

## Validation (Save / Send to approve)

| ID | Rule | Message |
|---|---|---|
| S-01 | Doc Date required; ≥ 1 source | "Pick at least one stock" |
| S-02 | **Split: Σ child pcs = source available pcs and Σ child weight = source weight** (no remainder kept on the source, Q-MS-04). New "+ Split" child is prefilled with what is left | "Row n: pcs/weight must add up to {Stock ID} ({pcs} pcs · {ct} ct)" |
| S-03 | Every result row: Location, Stock Price, Sale Price; Pcs ≥ 1 (weight-only stock per Load Q-LS-26), Weight > 0 | "Row n: …" |
| S-04 | Split: ≥ 2 children per source; Merge: ≥ 2 sources | "Split needs at least 2 new stocks" / "Merge needs at least 2 stocks" |
| S-05 | Merge: one location for the result (single row) | — |
| S-06 | **Totals check**: source totals (Pcs, Weight, Cost) vs result totals in the Summary rail and under the Totals row. Mismatch → orange warning banner "Result does not match the source: Pcs {a} vs {b}, Weight {x} vs {y}" and Save is blocked (Pcs/Weight); a cost difference ≤ 0.01 THB per row is rounding and not shown | banner |

First invalid row is scrolled into view and named (C).

## Lifecycle and states (aligned with Load, ADR-0050, C)

- **Approval OFF**: Save → **Approved** immediately (sources reduced, new stocks created). Edit/Delete reverse and re-apply until any new stock is **used** (Load Q-LS-19), then locked with "In use — cannot edit".
- **Approval ON**: Save → **Draft** (nothing held, nothing moved); Send to approve → **Pending** (locked); Approve (Approve Center, `merge-split` panel becomes available) applies; Revise → back to Draft with note; Reject final.
- **Delete** = soft delete (ADR-0045) → **Deleted** (read-only, Restore with DELETE grant). Delete of an Approved document reverses it if no new stock is used. The owner's "Cancelled" maps to Deleted/Rejected (Q-MS-14).
- At apply the server re-checks each source's on hand under lock; a change → `409`/row error "Row n: {Stock ID} changed, available now {pcs} pcs · {ct} ct" and the user re-picks (edits kept).
- States: page loading "Loading…"; not found "Merge/Split not found."; no VIEW → "You don't have permission to view Merge/Split."; no ADD/EDIT → buttons hidden; empty Result → "Use From Stock to pick stocks"; `syncing` → read-only notice.
- Toasts: "Saved {docNo}", "Sent to approve", "Approved", "Refreshed", "Added N rows", "Added with mode {mode}", "Deleted", "Restored".
- **Stock ID on save**: result rows show "Stock ID on save · Auto" until issued (no number is reserved for a preview, C Load DV-07); after apply they show the issued IDs. With approval ON, Stock IDs appear only after Approve.

## Effects (note for SA)

Stock Card / Stock Value must show: source stock OUT ("Merge/Split" kind, doc link) and each new stock IN, with cost carried (C-01/C-02). New stocks keep a link to their source Stock IDs (audit). Sources reaching 0 on hand behave like any 0-on-hand stock. Requires-sa: BE-MS rows.

## Responsive

No mobile source. Shared container-query breakpoints; header fields stack below `@2xl`; tables scroll horizontally (C).
