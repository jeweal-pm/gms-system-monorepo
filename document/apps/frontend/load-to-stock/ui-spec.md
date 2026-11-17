# UI specification: load-to-stock

- Feature ID / revision: `load-to-stock` / **1**
- Status: **draft**: complete for owner review, not approved. Open questions Q-LS-01…22 carry recommended defaults ([open-questions](open-questions.md)).
- Owner request (2026-11-16, verbatim): "flow หน้า load คือการนำ Purchase ไป load ของเข้าคลัง เราไม่จำเป็นต้องโหลดของใน Puchase ทั้งหมด สามารถเเบ่งโหลดได้เช่น PU26010-31 มีของ 10 ชิ้น ตอนกรอกลงตารางload สามารถแก้ไข pcs ได้สมมุติว่าloadไป 7ชิ้น PU26010-31 จะเหลือ 3 ชิ้น PU26010-31จะหายไปต่อเมื่อเป็นpcs เป็น 0 แล้ว จะนำของในตารางล่างไปเพิ่มในคลังถ้ามี approve ก็รอ approve ก่อนถึงจะตัด puchase เเละ เพิ่มของเข้าคลัง ถ้าไม่มีก็ตัดเลยเอาของเข้าคลังเลยเเก้ไขได้ลบได้จนกว่าของจะถูกนำไปใช้ โดยจะมี 3 หมวด 1. non โหลดของเข้าปกติ 2. split สามารถเเบ่งของออกมาเพิ่มเข้าคลังได้ 3. merge สามารถรวมของเป็นช่องเดียวได้ ส่วนรายละเอียดในปุ่ม more อิงจากหน้า puchase เเต่ไม่มีพวกdiscount เเต่มี price stock price sale price เข้ามาเเทน spec api คือสร้าง service ใหม่เลยไม่รวมกับ master"
- Source (owner-supplied screenshots, desktop, device scale unknown; opened in the image viewer 2026-11-16):

| File | Size (px) | Shows |
|---|---|---|
| [source/01-add-from-purchase.png](source/01-add-from-purchase.png) | 1407 x 805 | "Add From Purchase" picker, nothing selected |
| [source/02-load-mode-dialog.png](source/02-load-mode-dialog.png) | 1413 x 793 | 3 lines ticked; "How should these PU lines go into stock?" dialog, None selected |
| [source/03-page-none.png](source/03-page-none.png) | 1400 x 797 | New Load to Stock, mode None: Item table + Load table (3 rows) |
| [source/04-page-split.png](source/04-page-split.png) | 1407 x 790 | Same, mode Split: Load table grouped per PU line with "+ Split" |
| [source/05-page-merge.png](source/05-page-merge.png) | 1405 x 794 | Same, mode Merge: one load row + 4 empty rows + Totals |

- Inspection evidence: colours sampled from pixels with `sharp` (repo `node_modules`, read-only) on 2026-11-16. Code compared on branch `feat/16-11-26-load-ui` at `2e87a5b`.
- Main flow: [diagram/load-to-stock-flow.md](../../../diagram/load-to-stock-flow.md)
- Review bundle: this file, [open-questions](open-questions.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [design-system](design-system.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/load-to-stock-flow.md) and the [SA handoff](../../../coordination/handoffs/load-to-stock-sa.md). Central TODO: [`document/task/todo/load-to-stock.md`](../../../task/todo/load-to-stock.md).

## Source quality and open decisions

Evidence tags: **E** estimated from screenshot pixels (source px, not Figma); **C** existing code or an approved spec/ADR; **O** owner text; **A** assumption / recommended default (listed in [open-questions](open-questions.md)).

Not visible in any source, so these reuse established document-page behaviour (**A**): a saved document / view mode, status chip, Daybook, the More (row) panel, Document Note and Summary below the fold, loading/error states, print/Excel, mobile.

Decisions that change the flow (details in open-questions):

- what **Account** and **Currency** mean and whether lines from several vendors/currencies may be mixed (Q-LS-01, Q-LS-02, Q-LS-03);
- **when the Stock ID is issued and shown** — design "Stock ID on save SL-0311" vs ADR-0051 "issued at Load to Stock from the Memo Receive counter", with approval ON the stock only exists after Approve (Q-LS-04);
- which Purchase lines are loadable (MANUAL / PO only vs STOCK rows too; approved PUs only) (Q-LS-05);
- mode scope and Merge / Split rules — **owner 2026-11-16: one mode per document** (Q-LS-07); Merge with mixed price units allowed, merged row shows the highest-priced line (Q-LS-08); several PUs and currencies but **one vendor** (Q-LS-03);
- Location master source and "Parcel" (Q-LS-11);
- the backend is a **new service** (owner O), so every data item is **requires-sa** (Q-LS-22).

### Design variances (DV) the spec corrects

| ID | Design | Spec | Why |
|---|---|---|---|
| DV-01 | "Rfe." | **Ref.** | Spelling; shared header says "Ref." (C, Purchase DV-02) |
| DV-02 | Load row Price "52,490.00 USD per cts" | Price in the currency it is actually in (52,490.00 = 1,450.00 USD × 36.20 → **THB**) | The value is converted; the label is wrong (E arithmetic). Currency rule Q-LS-02 |
| DV-03 | Item table Location "BKK-01"; picker Location "Receiving" for the same lines | Item table shows the PU line's location as returned by the server | Mock-data mismatch |
| DV-04 | Picker row 1 code "AL-LBUDEXVS1AAA", Item row 1 "SA-RBLDEXVS1AAA"; dialog lists Ruby as "Oval 5.0×7.0 · Royal Blue VS1" but the row is "Cushion 3.0×4.0 · Pigeon Blood VS2" | Every view shows the PU line's real attributes | Mock-data mismatch |
| DV-05 | Merge Totals "3.66" / "131,372.00" under a 29.30 ct / 1,387,835.60 row | Totals are computed from the load rows | Placeholder numbers |
| DV-06 | Picker search "Search Stock ID, lot, memo, invoice" | "Search PU no., stone code, lot, cer no." | PU MANUAL/PO lines have no Stock ID (C, ADR-0051) and no memo/invoice |
| DV-07 | "New on load SL-0311" in the picker and Item table; "Stock ID on save SL-0311" in Load rows | Badge **"Auto"** until the ID is issued, then the issued ID (Q-LS-04 default) | A number cannot be previewed without consuming the shared counter (C, ADR-0051 / INV-20261029-002); Split creates several stocks from one line, so one preview number per PU line is not possible |
| DV-08 | Split group sub-line "Lot SL-0311" | "Lot {lot}" shows the PU line's lot; SL-number is not reused as Lot | SL-xxxx appears as both Stock ID and Lot (Q-LS-04) |
| DV-09 | Save fill `#006A70` | Existing `Button` primary `#0E5E63` | Same as Purchase DV-06; token alignment is separate (C) |
| DV-10 | Sidebar highlights **Quotation** while Load to Stock is open (03–05) | Load to Stock active | Design slip |
| DV-11 | Mixed "per ct" / "per cts" | Shared unit labels "per ct" / "per pcs" (C, `ItemEditorPanel` uses "per cts"/"per pcs"; keep the shared label) | One shared component |
| DV-12 | Mixed header case (LOCATION, PCS, Stone Code, Weight) | Shared table header case; Weight header "Weight (ct)" | Purchase DV-04/05 (C) |

## Page structure and layout

Route `/inventory/load-to-stock` (new) and `/inventory/load-to-stock/[id]` (saved) (**A**, following `/purchase-order/purchase`). Breadcrumb **Home › Inventory › Load to Stock** (E). Sidebar entry exists today as a placeholder (`link("load-to-stock", …)`, C `frontend/src/features/home/navigation.ts`); add `REAL_PAGE_HREFS["load-to-stock"]` and `activePrefix`. Opens in an app-shell tab titled with the document number (C, ADR-0037).

```
[ Breadcrumb Home › Inventory › Load to Stock                                                          ]
[ "Load to Stock No.:" LSGMS2609001 [scan]                        Print Excel Duplicate Refresh         ]
[                                             [+ Create New] [Cancel] [Save] [Edit] [Delete]            ]
[ card: Doc Date* (≈147) | Account* (≈327) | Currency* (≈327) | Ref. (≈327)                             ]
[ card: Item  3 items [From Purchase] [scan]                                                            ]
[       Item table (picked PU lines, read-only)                                                         ]
[ ─────────────── divider ≈3 px #EDEDED ───────────────                                                 ]
[ Load  3 rows                                                                          rail ▢ ▢       ]
[ Photo box ≈200 | Load table (None: flat · Split: grouped per PU line · Merge: one row)                 ]
[ (below the fold, A) Document Note | Summary                                                           ]
```

| Region | Evidence | Rule |
|---|---|---|
| Sidebar ≈173 px, topbar ≈30 px, page bg `#F9F9F9` | E (sampled) | Existing app shell (C) |
| Header card: 4 fields on one row, ≈40 px inputs | E | `VendorDocumentInfoForm`-like grid; one row `[≈150px_1fr_1fr_1fr]` (A) |
| Item card: title + count + "From Purchase" dark button (≈88 x 26, `#1C252E`) + scan icon | E (sampled) | `Button variant="dark" size="sm"` (C) |
| Divider between Item and Load ≈3 px `#EDEDED` | E | Shared section divider (C nearest) |
| Load: photo box ≈200 px + table | E | `ItemPhotoBox` + table (C pattern) |
| Right rail 2 icons beside the Load table | E | `RailButtons`: Daybook, Summary (A, Purchase pattern) |

Responsive: no mobile source. Reuse the shared form's container-query breakpoints (C); header fields stack below `@2xl`; tables scroll horizontally. No new mobile behaviour.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Evidence |
|---|---|---|---|---|
| H-01 | "Load to Stock No.:" + number + scan icon | `QuotationHeader` (`isPreview`) | New: grey preview from Document Setup › Load to Stock (`load-to-stock`, default code **LS**, C `document-setup.transactions.ts`). Saved: issued number + status chip (ADR-0050 D6) | E "LSGMS2609001" |
| H-02 | Print, Excel | `QuotationHeader` | Disabled (out of scope, as Purchase) | E |
| H-03 | Duplicate | `DocumentForm.onDuplicate` | **A**: disabled for Load to Stock — rows are bound to PU remaining quantities (Q-LS-17) | E |
| H-04 | Refresh | `DocumentForm` | Reload; confirm when dirty (C) | E |
| H-05 | Create New / Cancel / Save / Edit / Delete (+ **Send to approve** when approval ON) | `QuotationHeader` + `approval-flow.tsx` (`useApprovalSetting("load-to-stock")`) | ADR-0050 D2/D4: approval ON → Save = Draft, Send to approve, locked while Pending; OFF → Save applies, Edit/Delete until used. Leaf `load-to-stock` ADD/EDIT/DELETE (C, auth catalog). New doc: Edit/Delete disabled (E `#94C0C3` pale) | E, C |
| I-01 | Doc Date * | `FormDateInput` | Default today | E |
| I-02 | Account * | `FormSelect` (`GET /load-to-stock/vendors`) | **Q-LS-01: the vendor of the picked PU lines** (`code · name`), auto-filled by the first pick, then locks the picker to that vendor (owner Q-LS-03: several PUs and currencies allowed, **one vendor** per document). Design shows "Select" with items already loaded (E) | E |
| I-03 | Currency * | `FormSelect` (Setup › Currency) | **Q-LS-02 default**: the stock-cost currency = company currency (THB); prices from PU lines are converted at each PU's own rate (design Amount column "THB · rate 36.20") | E "USD" |
| I-04 | Ref. | `TextInput` ≤ 100 | Optional | E (DV-01) |
| T-01 | "Item  N items" | `DocumentForm` title | Count of distinct picked PU lines | E |
| T-02 | **From Purchase** (dark) | new picker button | Opens P-01. Enabled in new/edit mode with ADD/EDIT. The first pick opens P-02 to set the document `mode`; later picks skip P-02 and reuse that mode (Q-LS-07) | E |
| T-03 | Scan icon | `IconButton` + `ScanIcon` | Disabled placeholder (C, every transaction page) (Q-LS-16) | E |
| T-04 | Item table (picked PU lines, read-only) | new `LoadSourceTable` (shared table styles) | Columns IT-1…10 below. No checkbox/remove; a source is removed from the Load table (S-03 trash / last row removed) | E |
| L-01 | "Load  N rows" | title | Count of load rows (merged = 1) | E |
| L-02 | Photo box "Add up to 5 photos" + Item Note | `ItemPhotoBox` | Shows the selected load row's photos (≤ 5) and note. Initial photos are **copied from the PU line** and can be changed (Q-LS-14 owner) | E |
| L-03 | Load table — mode **None** | `ItemTable`-style table with a Load `DocumentKind` | Columns LT-1…12; one row per PU line; no add-row, no "+ Split" (O dialog text "No rows can be added") | E 03 |
| L-04 | Load table — mode **Split** | same + group rows | Group row S-01 per PU line, children = load rows; "+ Split" adds a child; group trash removes the PU line | E 04 |
| L-05 | Load table — mode **Merge** | same | **One merged row per document** from all picked lines (later picks join it); "From PU2610-031 + PU2610-038"; details and photos from the highest-priced line (Q-LS-08/27) | E 05, O |
| L-06 | Empty rows "Empty row · click to pick a PU line, or use Load in PU Items" | `DocumentKind.emptyRowText` | Shown only in 05. **Q-LS-15 default: no empty rows**; clicking the table's empty area opens P-01 | E 05 |
| L-07 | Totals row | `ItemTable` Totals | Pcs, Weight, Amount totals (computed; DV-05) | E 05 |
| L-08 | Row ⊖ remove / checkbox + "Remove N selected" | `ItemTable` (C) | Removing a load row returns its quantity to the source; when a PU line has no load row left it leaves the Item table | E |
| L-09 | More `…` → row panel | `ItemEditorPanel` with a Load kind | Purchase's panel **without** `DiscountPair`; adds **Price**, **Stock Price**, **Sale Price** (O). Fields M-01…below | O, C |
| R-01 | Right rail | `RailButtons` / `RailPanelView` | Daybook (newest first, status dot per ADR-0050 D6) and Summary (totals; no discount/tax) (Q-LS-18) | E (2 icons) |
| S-NOTE | Document Note (below fold) | `DocumentNote` 250 | **A** as Purchase; not visible (Q-LS-18) | A |

### Item table columns (T-04) — one row per picked PU line

| # | Header (sub) | Format | Evidence |
|---|---|---|---|
| IT-1 | # | Row number | E |
| IT-2 | Stone Code (Stock ID · Lot) | Bold stone code; badge line "New on load **Auto**" (DV-07) + lot; note line `MessageSquare` "From {PU no.} · {PU doc date dd/MM/yy}" | E |
| IT-3 | Location | PU line location text | E (DV-03) |
| IT-4 | Stone (Shape · Size) | Bold stone; sub shape · size | E |
| IT-5 | Color · Clarity (Cutting · Quality) | Text | E |
| IT-6 | Cer Type (Cer No.) | Chip with cer type, cer no. below; "No certificate" when none | E |
| IT-7 | Pcs | Integer, right; **PU line remaining before this document** | E |
| IT-8 | Weight (ct) | Decimal Setup weight places | E |
| IT-9 | Price (Unit) | PU price + PU currency; sub "per ct · rate 36.20" | E |
| IT-10 | Amount | Company currency (THB) amount of the remaining quantity | E |

Sorting: header glyphs are drawn, but the shared tables do not sort (C, Purchase Q-PU-12) → unsorted, server order (A).

### Load table columns (L-03…05)

| # | Header (sub) | Format / edit | Evidence |
|---|---|---|---|
| LT-1 | ☐ | Row checkbox; header select-all | E |
| LT-2 | ⊖ | Red `CircleMinus` `#E74C50` remove | E (sampled) |
| LT-3 | # | Row number (in Split, numbered within the group) | E |
| LT-4 | Stone Code (Stock ID · Lot) | Stone code; badge "Stock ID on save **Auto**" before issue, then the issued Stock ID (yellow `#FFD88A` badge); note line "From {PU no.}" (Merge: "From {PU} + {PU}") | E (DV-07) |
| LT-5 | Location | Link-style grey `#808D99` "Select location" (required, Q-LS-11) + second line "Parcel" | E |
| LT-6 | Stone (Shape · Size) | Text; editable in the panel (None/Merge; Split too — A) | E, O dialog |
| LT-7 | Color · Clarity (Cutting · Quality) | Text | E |
| LT-8 | Cer Type (Cer No.) | Chip | E |
| LT-9 | Pcs | Integer ≥ 1; editable (None/Split) ≤ source remaining; Merge = sum, locked (O dialog) | E, O |
| LT-10 | Weight (ct) | > 0; editable (None/Split) ≤ source remaining; Merge = sum, locked | E, O |
| LT-11 | Price (Unit) | Read-only `unitCostThb` + THB (DV-02) + unit. Cost by the PU line's price unit (owner Q-LS-12): per ct → weight × unit price × PU rate; per pcs → pcs × unit price × PU rate. Merge (mixed units allowed): row cost = Σ source costs; unit per ct unless all sources are per pcs (Q-LS-27); price = cost ÷ row basis (E "average 47,366.40 THB per ct" = 1,387,835.60 ÷ 29.30) | E, O |
| LT-12 | Amount | `costAmountThb` (Σ source costs as LT-11) | E |
| LT-13 | More | `…` opens L-09 | E |

### Split group row (S-01, mode Split)

Fill `#F9F9F9` (E sampled). Chevron (collapse) · group number · bold "{PU no.} · {Stone} {Shape} {Size}"; sub "{Color} · {Clarity} · {Cutting} · {Quality} · Lot {lot} · {Cer type} {Cer no.}". Middle: "→ No location yet" / "→ {n} locations" and "{n} load row(s)". Right: bold "{pcs} pcs · {weight} cts" (source remaining), sub "{amount} THB · {price}/cts". Actions: **+ Split** outline button (adds a child row), trash `#EB8487` (removes this PU line and its children, confirm). E 04.

### Row panel (L-09) — "More"

Based on Purchase/Memo Receive `ItemEditorPanel` (C) with the Purchase discount removed (O):

| ID | Field | Rule |
|---|---|---|
| M-01 | Stock ID | Read-only: "Auto" until issued (Q-LS-04) |
| M-02 | Lot | From PU line; editable (A) |
| M-03 | Location * + Parcel | Q-LS-11 |
| M-04 | Stone Code, Stone, Shape, Size, Color, Clarity, Cutting, Quality | Stone Master selects (C); prefilled from the PU line; editable in all modes (O: None "every detail can be changed", Merge "change stone, grading and certificate") |
| M-05 | Cer Type, Cer No. | As above |
| M-06 | Pcs, Weight (ct) | Editable ≤ remaining (None/Split); locked in Merge |
| M-07 | Price Unit (per ct / per pcs) | From PU line; read-only (cost comes from the PU, A) |
| M-08 | **Price** | Cost per unit from the PU line (net of the PU line discount, converted); read-only (Q-LS-13) |
| M-09 | **Stock Price** * | **Required**, starts **empty** (no default from Price); ≥ 0, THB per the row's price unit (owner Q-LS-13; contract `stockPrice`) |
| M-10 | **Sale Price** * | **Required**, starts **empty**; ≥ 0, THB per the row's price unit (owner Q-LS-13; contract `salePrice`) |
| M-11 | Note | Item note, as Purchase limit (C) |
| M-12 | Photos | PU line photos are **copied** as the row's initial photos (`POST /load-to-stock/photos/from-purchase-line`); the user can remove, replace or add, ≤ 5 (`photoIds`). Split: each child starts with its PU line's photos. Merge: photos of the highest-priced source line (owner Q-LS-14, Q-LS-27) |

Previous/next row and Close buttons as `ItemEditorPanel` (C).

## Dialogs

### P-01 Add From Purchase (source 01)

- Trigger: T-02 "From Purchase" (or clicking the empty Load area). Large modal ≈1195 x 732 px (E), title "Add From Purchase", ✕ close, Esc closes, focus returns to T-02 (C `MemoStockModal` behaviour). Overlay dims the page.
- Tools: search (debounced 250 ms, DV-06) and Start → Due date range on PU Doc Date (C picker pattern).
- Columns: ☐ · # · **PU No.** (sub Doc Date) · Stone Code (Stock ID · Lot; "New on load Auto") · Location · Stone (Shape · Size) · Color · Clarity (Cutting · Quality) · Cer Type (Cer No.) · **Pcs** (= remaining) · Weight · Price (Unit, PU currency) · Amount (THB, sub "THB · rate x" or "THB").
- Rows: lines of **approved** Purchases (Q-LS-05) that are `MANUAL`/`PURCHASE_ORDER` (no Stock ID) with remaining pcs > 0, excluding lines already on this document. A line disappears when remaining pcs = 0 (O). Paged 50, Load more (C). Selected rows tint teal (E).
- Footer: Cancel, **OK** (disabled `#E4E4E4` until ≥ 1 row ticked, E). OK opens P-02 over the picker.
- States: loading, empty "No purchase lines left to load", error with retry (C pattern).

### P-02 Load mode — "How should these PU lines go into stock?" (source 02)

- **One mode per document** (owner Q-LS-07; contract header `mode`). P-02 opens only on the first pick into an empty Load table. Later picks reuse the document mode (None: rows appended; Split: new groups; Merge: the lines join the one merged row), with the toast "Added with mode {mode}". To change the mode, the user empties the Load table first; the next pick then opens P-02 again.

- Modal ≈468 px wide (E) over P-01. Intro "You picked **N PU lines**. Each load row becomes one stock with its own Stock ID."
- Summary list of picked lines: "{Stone} {Shape} {Size} · {Color} {Clarity}", sub "{PU no.} · {price} {cur} per {unit} · {THB per pc} THB per pc", right "{pcs} pcs · {weight} ct".
- Radio cards (selected: border/fill teal tint, radio `#006A70`; E):
  1. **None · as it is, one load row per PU line** — "N load rows, same as the PU lines. Every detail can be changed, including stone, shape, size, pcs and weight. No rows can be added."
  2. **Split · one load row per PU line** — "N load rows → N stocks. Each row keeps its own cost. Pcs, weight and details can be changed, e.g. to split a line over several locations."
  3. **Merge · all picked PU lines into one load** — "N lines → 1 row · {Σpcs} pcs · {Σct} ct · average {x} THB per ct. Suggested details come from the most expensive line per piece: {line} ({PU}, {THB per pc}). Change stone, grading and certificate in the row if needed. Pcs and weight come from the PU lines. A merged row can't be split later." Disabled with a reason only when fewer than 2 lines are picked; **mixed price units are allowed** (owner Q-LS-08). The suggested line is the highest THB amount per piece (Q-LS-27).
- Footer: **Back to list** (returns to P-01 with ticks kept) and primary **"Create N load rows"** (Merge: "Create 1 load row"). Create closes both dialogs, fills Item and Load tables, toast "Added N load rows".
- Default selection: None (E). Keyboard: radio group arrow keys; Enter = Create.

## Interaction and data

- Access (C): leaf `load-to-stock` (`useDocumentAccess("load-to-stock")`); no VIEW → "You don't have permission to view Load to Stock."
- Approval (C, ADR-0050): `useApprovalSetting("load-to-stock")` decides Save / Send to approve. ON: Save → Draft (no PU deduction, no stock); Send to approve → Pending (locked); Approve (Approve Center) deducts PU remaining and creates stocks; Revise once, Reject final. OFF: Save deducts and creates stocks immediately; Edit/Delete reverse and re-apply until any created stock is **used** (Q-LS-19). Approve Center row for Load to Stock is "not-available" today (C `approve-center/menus.ts`) and becomes available with this feature (FE-LS-011).
- Remaining quantity: PU remaining = line pcs/weight − loaded by **approved/applied** loads. Drafts and pending loads hold nothing; the server re-checks under lock at Approve / applied Save (ADR-0050 pattern) (Q-LS-06).
- Save validation: Account, Currency, Doc Date required; ≥ 1 load row; every row Location, Stock Price and Sale Price (required, owner Q-LS-13), Pcs ≥ 1, Weight > 0 (weight-only / pcs-only lines per Q-LS-26); per PU line Σ(load pcs) ≤ remaining pcs and Σ(weight) ≤ remaining weight; first bad row named "Row n: …" (C).
- Backend is a **new service** (O); every operation is **requires-sa** — see [data-fetching](data-fetching.md) and the [SA handoff](../../../coordination/handoffs/load-to-stock-sa.md).

## States

Loading "Loading…"; not found "Load to Stock not found."; view vs edit mode as the shared form (C); toasts "Saved {docNo}", "Sent to approve", "Refreshed", "Added N load rows", row errors "Row n: …"; conflict on stale version keeps edits ([error-handling](error-handling.md)). Status chip and Daybook dots per ADR-0050 D6 (Draft grey, Pending orange, Revise orange + reason, Approved green, Rejected red + reason).

## Dependencies and traceability

No new package ([dependencies](dependencies.md)). Every component maps to TODO IDs FE-LS-001…013 in the [central TODO](../../../task/todo/load-to-stock.md). Backend: new service (SA-LS-01…, requires-sa).
