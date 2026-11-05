# UI specification: purchase

- Feature ID / revision: `purchase` / **2**. Revision 1 is the body of this file. Revision 2 is the [Revision 2 section](#revision-2-add-memo-stock-and-purchase-order-dialogs) at the end; where they differ, revision 2 wins.
- Status: revision 1 **approved** 2026-11-04 (FE-PU-001/002, see the [TODO](../../../task/todo/purchase.md)). Revision 2 **approved** 2026-11-04 by the owner's message recorded in the Revision 2 section. Items marked requires-sa still wait for the SA bundle and its separate approval.
- Owner request (2026-11-04, verbatim): "uxui ช่วยเขียน spec หน้า purchase frontend ทำ ui หน่อย"
- Source: [source/01-purchase-new.png](source/01-purchase-new.png), a desktop screenshot of a **new** Purchase. It is 2101 x 1179 px; the device scale is unknown. It was the only screen supplied for revision 1. Revision 2 adds `source/02…07` (the PU page again and the Add Memo Stock dialog), listed in the Revision 2 section.
- Inspection evidence: the image was opened in the image viewer on 2026-11-04. Colours were sampled from its pixels with `sharp` (repo `node_modules`, read-only). The code was compared on branch `feat/04-11-26-pu-out-standing` at `f542171`, plus the uncommitted transaction-confirm-modal change.
- Main flow: [diagram/purchase-flow.md](../../../diagram/purchase-flow.md)
- Review bundle: this file, [open-questions](open-questions.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [design-system](design-system.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/purchase-flow.md), and the [SA handoff](../../../coordination/handoffs/purchase-sa.md). Central TODO: [`document/task/todo/purchase.md`](../../../task/todo/purchase.md).

## Source quality and open decisions

Each value below is tagged with where it comes from:

- **E**: estimated from the screenshot's pixels, in source px. These are not Figma measurements.
- **C**: existing code or an approved spec.
- **O**: owner text.
- **A**: an assumption or recommended default, which needs a decision. These are listed in [open-questions.md](open-questions.md).

Not visible in the source, so these reuse the established Memo Return, Memo Receive and Quotation behaviour (**A**):

- a saved document or view mode
- the status badge
- the Memo Stock and Purchase Order dialogs
- the row panel
- the lower part of Summary Value: a checkbox is cut off at y ≈ 1170, which is likely Tax
- loading, error and mobile states
- the print and Excel output

Decisions that change the flow, with their IDs:

- whether the page waits for SA and backend, or ships first with mock data (Q-PU-01)
- what the Purchase Order button does while PO does not exist (Q-PU-02)
- what a Purchase does to stock (Q-PU-03)
- manual rows and their Stock ID (Q-PU-05)
- approval (Q-PU-06)

Design spelling and labels (DV) that the spec corrects:

| ID | Design text | Spec | Why |
|---|---|---|---|
| DV-01 | "Vender" | **Vendor** | Spelling; Memo Receive and Memo Return already say "Vendor" (C). Recorded as Q-PU-09. |
| DV-02 | "Rfe." | **Ref.** | Spelling; the vendor header component says "Ref." (C). |
| DV-03 | Column "PRICE / UNIT" | **Price** / sub "Unit" | Buying cost, not a Sale Price. This needs a column-title option in the shared table (FE-PU-001). |
| DV-04 | Column "Weight" | **Weight (ct)** | The shared table's existing label (C); it is the same on every transaction page. |
| DV-05 | Mixed header case ("LOCATION", "PCS", "Stone Code") | Existing shared header case | One shared table component (C); the design mixes the two styles. |
| DV-06 | Save fill `#006A70` | Existing `Button` primary `#0E5E63` | The colour differs on every shipped transaction page. Page-local colours are not changed. Token alignment is a separate design-system task (see [design-system](design-system.md)). |

## Page structure and layout

Route `/purchase-order/purchase` for a new document and `/purchase-order/purchase/[id]` for a saved one (**A**, following `/pre-sale/reserve` and `/memo/memo-return`; C). The breadcrumb is Home › Purchase Order › Purchase (E). The sidebar entry "Purchase (PU)" sits in the existing `purchase-order` section, slug `purchase`, and is active on `/purchase-order/purchase/*`. The page opens in an app-shell tab (`TabPage`) whose title is the document number (C).

```
[ Breadcrumb Home › Purchase Order › Purchase                                     (topbar, existing)  ]
[ "Purchase No.:"  PUGMS2609001 [scan]                       Print Excel  Duplicate Refresh           ]
[                                          [+ Create New] [Cancel] [Save] [Edit] [Delete]             ]
[ Doc Date* (≈217) | Vendor* (1fr)                       | Address* (1fr)                             ]
[ Due Date* (≈217) | Currency* (1fr) | Exchange Rate (read-only, 1fr) | Ref. (1fr)                     ]
[ ─────────────────────────────── divider #E3E7EC ─────────────────────────────────────────────────── ]
[ Item  5 rows  [Memo Stock] [Purchase Order] [scan]                                       rail ▢ ▢  ]
[ Photo box ≈297 | Item table (5 empty rows, Totals, + Add row)                                       ]
[ Document Note (0/250)                                   | Summary Value (≈480)                      ]
```

| Region | Evidence | Rule |
|---|---|---|
| Sidebar ≈257 px, topbar ≈49 px | E; existing app shell (C) | Unchanged |
| Content gutter ≈28 px from the sidebar | E; `px-6` in the shared form (C) | Use the shared form spacing |
| Header fields: rows ≈56 px high; columns 217 / 768 / 767 and 217 / 504 / 505 / 504 | E | The `VendorDocumentInfoForm` grid `[200px_1fr_1fr]` / `[200px_1fr_1fr_1fr]` (C) matches |
| Divider under the header, 1 px `#E3E7EC` | E (sampled) | The existing `border-[#E3E6EA]` `<hr>` (C) |
| Item tool buttons ≈111 x 37 and 134 x 37, fill `#1C252E` | E (sampled) | `Button variant="dark" size="sm"` (C) |
| Photo box ≈297 px wide, fill `#F9F9F9` | E | `ItemPhotoBox` (C) |
| Table: header ≈58 px, rows ≈61 px, header and Totals fill `#F9F9F9`, row lines `#F6F6F6` | E | `ItemTable` (C) |
| Summary Value ≈480 px | E | `lg:w-[440px]` (C); keep the shared width |
| Right rail: 2 icons (Daybook, Summary) | E | `RailButtons` (C) |

Responsive behaviour: there is no mobile source. Reuse the shared form's container-query breakpoints (C). Header fields stack below `@2xl`. The note and summary stack below `lg`. The table scrolls horizontally. No new mobile behaviour is invented.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|
| H-01 | Number "Purchase No.:" + scan icon | `QuotationHeader` (`noLabel`, `isPreview`, scan) | New document: a grey preview from Document Setup › Purchase (`purchase`, default code **PU**, C), with "Number preview — the number is issued when you save". Saved document: the issued number and a status badge (Q-PU-06). | E: "PUGMS2609001" (prefix `PUGMS` + running; set in Document Setup) |
| H-02 | Print, Excel | `QuotationHeader` | Disabled (out of scope, as Memo Receive) | E |
| H-03 | Duplicate | `DocumentForm.onDuplicate` | Copies everything to a new unsaved document with new row keys, as on the other transaction pages (C). **A**: Memo Stock rows are kept. Their pending is checked again at Save/Approve (Q-PU-08). | E |
| H-04 | Refresh | `DocumentForm` | Reloads the saved document; with unsaved changes, asks first (`useConfirm`) | E |
| H-05 | Create New / Cancel / **Save** (primary) / Edit / Delete | `QuotationHeader` actions | New document: Edit and Delete disabled (E, pale). Leaf `purchase` ADD / EDIT / DELETE (C, catalog). Delete and Cancel-with-changes use the app confirm modal (C, `use-confirm.tsx`). Save shows "Saving…" while it is busy. | E |
| H-06 | Approve (temporary, until the Approve page) | `DocumentForm` `approval` | Only with Q-PU-06 = approval: a saved Pending Approval document in view mode with `purchase:APPROVE` | A |
| I-01 | Doc Date * | `VendorDocumentInfoForm` `FormDateInput` | Default today (E shows 03/10/2026, the screenshot date) | E, C |
| I-02 | Vendor * | same, `FormSelect` | Active vendors as `code · name`. Choosing one picks its default address and currency (C). Changing it clears the Memo Stock rows from the previous vendor (C, Memo Return). | E ("Vender", DV-01) |
| I-03 | Address * | same | The vendor's addresses; empty until a vendor is chosen | E |
| I-04 | Due Date * | same | On or after Doc Date (C). Meaning: Q-PU-10 | E |
| I-05 | Currency * | same | Setup › Currency; default company currency (C) | E (USD) |
| I-06 | Exchange Rate | same, read-only `TextInput` | The currency's one Exchange Rate (owner 2026-10-27, C); empty for the company currency. Fill `#F8F8F8`, border `#EDEDED` (E). | E |
| I-07 | Ref. | same, `TextInput` ≤ 100 | Optional | E ("Rfe.", DV-02) |
| T-01 | Title "Item" + "N rows" | `DocumentForm` | Count of all rows | E |
| T-02 | **Memo Stock** (dark); rev 2: dialog R2-MS | `DocumentForm` picker → `MemoStockModal` | Opens "Add Memo Stock" with the chosen vendor's Memo Stock in the document currency (`vendorId` + `currency`, `showPrice`). It is blocked with a toast until a vendor and currency are chosen (C, Memo Return). | E; Q-MR-11 / Q-MR-14 (C) |
| T-03 | **Purchase Order** (dark); rev 2: **active**, dialog R2-PO (superseded text follows) | new second item button (FE-PU-001) | PO does not exist. **Default: visible but disabled**, tooltip "Purchase Order isn't available yet" (Q-PU-02) | E |
| T-04 | Scan icon | `IconButton` + `ScanIcon` | Disabled placeholder, as on every transaction page (C, TODO in code) | E |
| T-05 | Photo box "Add up to 5 photos" + Item Note | `ItemPhotoBox` | Shows the selected row's photos and note. Photo upload on Purchase: Q-PU-11 (default none in rev 1). | E |
| T-06 | Item table | `ItemTable` with a Purchase `DocumentKind` | Columns below; 5 empty rows to start; + Add row (max 200 rows, C `LINES_MAX`); row checkbox + "Remove N selected"; per-row remove (red ⊖); More menu (Edit, Duplicate, Clear, Remove). Duplicate is hidden on Memo Stock rows (C, `stockQuantity`). | E |
| T-07 | Empty row text; rev 2: design text restored (R2-02) | `DocumentKind.emptyRowText` | Design: "Empty row · click to enter details, or use Memo Stock and Purchase Order to populate." **Default while PO is disabled**: "Empty row · click to enter details, or use Memo Stock to fill it". Restore the design text when PO exists (Q-PU-02). | E |
| T-08 | Totals row | `ItemTable` | PCS total, Weight total and Amount total (E shows `0.00` under Weight and Amount); decimal places from Decimal Setup (`useNumberFormat`, C) | E |
| T-09 | Row panel | `ItemEditorPanel` | Manual rows: as Memo Receive (stone, quality, certificate, pcs, weight, price unit, **Price**, line discount, note). Memo Stock rows: stone fields locked, Pcs/Weight editable up to the item's pending (C, `stockQuantity`). Q-PU-04, Q-PU-05. | A |
| R-01 | Right rail | `RailButtons` / `RailPanelView` | Daybook (saved purchases, newest first) and Summary Value | E (2 icons) |
| S-01 | Document Note | `DocumentNote` max **250** | Counter "0/250" (E). Placeholder "e.g. Paid by transfer on delivery." Hint "Printed on the purchase for the vendor". | E |
| S-02 | Summary Value | `SummaryValue` | Subtotal; **Discount** checkbox (amount in red `#DF1016`, E) with the % / amount pair; Total after Discount + currency code. Below the fold (not visible): Tax / Other Charge / Grand Total as Quotation (**A**). | E |

### Item table columns (T-06)

| # | Header (sub) | Format | Sort | Evidence |
|---|---|---|---|---|
| 1 | ☐ | Row checkbox; header = select all | — | E |
| 2 | (remove) | Red ⊖ `CircleMinus` | — | E |
| 3 | # | Row number | — | E |
| 4 | **Stone Code** (Stock ID · Lot) | Manual row: Stone Code, with Stock ID shown below (Q-PU-05). Memo Stock row: the Stock ID leads (Memo Stock has no stone code, C). | Design shows a sort glyph; the shared table does not sort (C). Keep it unsorted (Q-PU-12). | E |
| 5 | Location | Memo Stock row: `Memo` (C). Manual row: Q-PU-05. | as above | E |
| 6 | Stone (Shape · Size) | Text | as above | E |
| 7 | Color · Clarity (Cutting · Quality) | Text | as above | E |
| 8 | Cer Type (Cer No.) | Text | as above | E |
| 9 | Pcs | Integer, right-aligned | as above | E |
| 10 | Weight (ct) | Decimal Setup weight places, right-aligned | as above | E (DV-04) |
| 11 | **Price** (Unit) | Price places + unit (per ct / per pcs) + line discount | as above | E (DV-03) |
| 12 | Amount | Price places, with the left border | as above | E |
| 13 | More | `Ellipsis` menu | — | E |

## Interaction and data

- Access (C): leaf `purchase` from `permission.mine` (`useDocumentAccess("purchase")`). Without VIEW the page shows "You don't have permission to view purchases." ADD, EDIT, DELETE and APPROVE gate the buttons. The server checks every call (requires-sa: `MasterMenu` has no `purchase` yet).
- Save (requires-sa): it checks every field first ([form-guidelines](form-guidelines.md)) and names the first bad row (C, INV-20261102-003). A new purchase opens at `/purchase-order/purchase/<id>` in the same tab. Under the Q-PU-01 default, Save is wired only after the backend exists.
- Memo Stock (requires-sa: grant `purchase:VIEW` on `memoStock.list`): the chosen rows fill the empty rows first, then are appended (C). Rows already on the document are left out of the dialog (C). Each row starts at the full pending and the price after the memo discount (C, Q-MR-13); both are editable (Q-PU-04).
- Stock effect (requires-sa, Q-PU-03): **nothing in the UI depends on it** except the Approve confirm text.
- Data, errors and tests: [data-fetching](data-fetching.md), [error-handling](error-handling.md), [testing](testing.md).

## States

- Loading: "Loading…" (C). Not found: "Purchase not found." A load error uses the shared domain error text (C).
- View and Edit modes as the shared form. A saved document opens in view mode (C). **A**: there is no "Purchase Details" view card, because the source has no view design. The disabled header fields are shown instead (Memo Out pattern, C).
- Toasts: "Saved {docNo}", "Refreshed", "Added N items from Memo Stock", "Duplicated as a new purchase", and the row error "Row n: …" (C).
- Empty master lists: a short message on the field (C).

## Accessibility

Every input keeps a visible label. Required fields keep `*` (red), and `aria-required` comes from `Field` (C). The disabled Purchase Order button sits in a `<span title>`, so its reason is announced on hover and focus. A disabled `<button>` gets no focus, so the reason is also given as `aria-describedby` text (FE-PU-001). Dialogs reuse `MemoStockModal`: Escape closes it, it has `aria-modal`, and the dialog title has an id (C). The app confirm modal returns focus to its trigger (C).

## Dependencies and traceability

No new packages ([dependencies.md](dependencies.md)). The SA handoff is [purchase-sa.md](../../../coordination/handoffs/purchase-sa.md). TODO IDs FE-PU-001…007 and BE-PU-001…005 are in [todo/purchase.md](../../../task/todo/purchase.md). Related specs:

- [memo-return](../memo-return/ui-spec.md): vendor header, Memo Stock picker
- [memo-receive](../memo-receive/ui-spec.md): manual rows, Stock ID "Auto"
- [memo-out](../memo-out/ui-spec.md): rows that take part of a stock item
- [document-setup](../document-setup/ui-spec.md): the PU number

## Out of scope (revision 1)

- Purchase Order and Purchase Outstanding pages
- Print and Excel
- barcode scan
- the Approve page
- payable / AP posting
- un-approve or cancel
- a location master
- photo upload, unless Q-PU-11 says otherwise
- any change to the auth permission catalog (leaf `purchase` already exists with all nine actions, C)

## Revision 2: Add Memo Stock and Purchase Order dialogs

### Request, approval and sources

- Owner message (2026-11-04, verbatim): "backend ทำ api เลย / logic หน้า PU หน้าจอการทำงานของ PU และ PO มีรูปแบบและโครงสร้างข้อมูลที่คล้ายคลึงกัน โดยข้อมูลหลักที่สามารถปรับเปลี่ยนได้ ได้แก่ จำนวน น้ำหนัก และราคา / Purchase ปุ่ม Memo Stock จะตัดจาก stock ของ memo และปุ่ม Purchase Order PU จะตัด stock จากการเปิด PU"
- Meaning used in this spec (**O**):
  - PU and PO screens have the same layout and data shape.
  - On a picked row, the user changes **Pcs, Weight and Price**.
  - **Memo Stock** takes from the vendor's Memo Stock.
  - **Purchase Order** takes from approved PO lines. The PO page now exists: see the [purchase-order ui-spec](../purchase-order/ui-spec.md) and [ADR-0041](../../../adr/0041-purchase-order-document.md).
- Owner clarification (2026-11-04, verbatim): "Purchase ปุ่ม Memo Stock จะตัดจาก stock ของ memo และปุ่ม Purchase Order PU จะตัด stock จากการตัดใบ PO ที่มีการซื้อเข้าเข้ามา"
  - Meaning (**O**): **Memo Stock** deducts from the vendor's memo stock.
  - **Purchase Order** picks lines from **approved PO documents whose goods are being bought in**. The purchase deducts from those PO lines' **outstanding** (open) quantity, that is ordered − purchased (C, SA-PO-05).
  - It does **not** deduct "from opening the PU". This clarification replaces that reading of the first message.
- **Approval evidence for UI revision 2.** The owner's message and clarification above, together with the design they supplied on 2026-11-04, are the instruction to proceed. The clarification is the decision text for the Purchase Order button.
  - Approved revision: UI revision 2. That is this section, the revision 2 rows of [open-questions.md](open-questions.md) (the Q-PU-02 answer and Q-PU-16…23), the revision 2 cases in [testing.md](testing.md), and the "Revision 2" addenda in [data-fetching](data-fetching.md), [design-system](design-system.md) and [dependencies](dependencies.md), with the sources below.
  - Approved by the owner on 2026-11-04. Recorded by ui-spec at the parent's request.
  - This covers the UI only. Items marked **requires-sa** (R2-D-xx below) also need the SA bundle and its own approval before the dependent code.
- Owner decisions that **supersede the revision 1 defaults**:
  - **Q-PU-02**: the Purchase Order button becomes **active**. It deducts from the outstanding quantity of approved PO lines, per the clarification. It opens an "Add Purchase Order" dialog from the same family as Add Memo Stock (R2-PO). This replaces the rev 1 default (button disabled, "Purchase Order isn't available yet").
  - **T-07**: the empty-row text names both buttons again, as in the design (R2-02).
  - **Q-PU-04**: on a picked row (from Memo Stock or Purchase Order), the user changes **Pcs, Weight and Price** (R2-03).

| File | What it shows | Size / scale | Evidence |
|---|---|---|---|
| [source/02-purchase-page-a.png](source/02-purchase-page-a.png) | PU page, new document, Purchase active in the sidebar | 1920 x 1080, 72 dpi | Opened in the image viewer 2026-11-04 |
| [source/03-purchase-page-b.png](source/03-purchase-page-b.png) | Same image | 1920 x 1080 | **Byte-identical to 02** (MD5 `f2696e00…`). Kept because the owner supplied it twice. |
| [source/04-memo-stock-dialog-sold-collapsed.png](source/04-memo-stock-dialog-sold-collapsed.png) | Add Memo Stock. The Sold group is collapsed and the In stock group is expanded. | 3840 x 2160; treated as **2x of 1920 x 1080** (E) | Viewer + `sharp` pixel sampling |
| [source/05-memo-stock-dialog-expanded.png](source/05-memo-stock-dialog-expanded.png) | Add Memo Stock with both groups expanded | 3840 x 2160 (2x) | Viewer + `sharp` |
| [source/06-memo-stock-row-states.png](source/06-memo-stock-row-states.png) | Row component variants: 3 Sold on the left, 3 In stock on the right. This is a Figma variant-set export with a transparent background and a purple dashed frame `#8A38F6`. | 6240 x 670 (2x) | Viewer + `sharp` pixel diff |
| [source/07-memo-stock-group-headers.png](source/07-memo-stock-group-headers.png) | The two group header rows | 3040 x 164 (2x, so 1520 CSS px wide, the table card's width) | Viewer + `sharp` |

The PU page in 02/03 matches [01](source/01-purchase-new.png) and revision 1, with two visible differences:

- the sidebar: a Purchase Order section with "Purchase Order (PO)", Purchase active, and Purchase Outstanding
- the 1920 px viewport

Pixel values in this section are in **CSS px at 1920 x 1080**: the source px of 04–07 are divided by 2 (E). Values are tagged E/C/O/A as in revision 1. None of them is a Figma measurement.

### Revision 2 design notes (DV)

| ID | Design | Spec | Why |
|---|---|---|---|
| DV-07 | In 06, the In stock variants still show "INV2610-021 · 28/10/26" and a customer. | Follow 05: an In stock row shows "with us since memo". | 06 copied the sold text into the In stock variant. 05 is the full dialog. |
| DV-08 | 06 shows three variants per status, probably default, hover and selected. | **The source does not show any state difference.** Keep the existing picker states (C): hover fill `#FAFBFB`, a checked box `accent-[#0E5E63]`, and a click anywhere on the row toggles it. | A pixel diff shows the three rows in each column are identical. Only the dashed Figma frame differs. Measured: 0 differing pixels inside the rows (`sharp` diff, threshold 30). |
| DV-09 | Badge text: "Sold" `#DF1016` on `#FAE6E4`; "In stock" `#22C55E` on `#C1EFD2` | Keep the fills. Use darker text: **`#C2141A`** (5.13:1) and **`#166534`** (5.62:1). | The sampled pairs are 4.14:1 and **1.80:1**. Both are below WCAG AA 4.5:1 for 12 px text. See Q-PU-22. |
| DV-10 | Sold row left border: 3 px in 05, 4 px in 06 | **3 px `#DF1016`** | 05 is the full dialog. |
| DV-11 | LOCATION "BKK-01", with "Pair", "Parcel" or "Single" below | Show the item's `location` as the API gives it. Leave out the second line while there is no value for it. | Memo Stock `location` is always "Memo" (C, `memo_stock.location` default). No pair, parcel or single field exists anywhere in the schema (C). There is no location master (out of scope in rev 1). See Q-PU-19. |
| DV-12 | Sort glyphs on every column | Shown, but the columns do not sort | Same as the page table and the existing picker (Q-PU-12, C) |
| DV-13 | "with us since memo" under In stock | Static text, as drawn | It may have meant "since {memo date}". The Memo No. and date are already in the row. See Q-PU-21. |

### R2-01 Page changes

| ID | Change | Evidence |
|---|---|---|
| R2-01a | T-03 **Purchase Order** is enabled and opens R2-PO. Until a vendor and a currency are chosen, it shows the same blocked toast as Memo Stock: "Choose a vendor first" or "Choose a currency first" (C, Memo Return `blockedReason`). Until the PO-line API exists (requires-sa R2-D-05), the button stays disabled with the reason "Purchase Order lines aren't connected yet". This follows Q-PU-01: no mock data. | O, C |
| R2-02 | Empty row text (T-07): **"Empty row · click to enter details, or use Memo Stock and Purchase Order to populate."** This is the design text, as drawn in 01 and 02. | E, O |
| R2-03 | **Picked rows** come from Memo Stock or a Purchase Order. In the row panel the user changes only **Pcs, Weight and Price**. Stone, quality, certificate, lot, location and line discount are locked. Item Note stays editable (**A**: it is a note, not stone data). Pcs and Weight must be > 0 and ≤ the row's cap; Pcs fills Weight in proportion (C, Memo Out rev 2). The cap is the Memo Stock quantity (R2-D-02) or the PO line's open quantity (R2-D-05). Price is required and > 0. It starts at the source's net unit price: for memo, after the memo line discount (C, Q-MR-13); for PO, after the PO line discount. | O, C, A |
| R2-04 | A **vendor change** clears the rows picked from **both** sources, not only Memo Stock rows. This extends C `clearMemoStockRows`. Manual rows stay. | A (same rule as rev 1) |
| R2-05 | The row's Stock ID cell. A Memo Stock row shows the item's Stock ID (C). A PO row shows **"Auto"**, with "from {PO No.}" below, because PO lines have no Stock ID (C, SA-PO-01). The server assigns one with the same rule as manual rows (Q-PU-05, requires-sa). | C, A |

### R2-MS Add Memo Stock dialog (sources 04–07)

**Layout** (E unless marked):

```
┌ Add Memo Stock ─────────────────────────────────────────────────────────────── X ┐  title bar ≈63, divider 1 px #E6E6E8
│  [All 5|Sold 2|In stock 3]                 [Search Stock ID, lot, memo, invoice] [Start → Due]   │
│ ┌ table card (1 px #EDEDED, radius ≈8) ───────────────────────────────────────────────┐ │
│ │ ☐ # STOCK ID  LOCATION  STONE  COLOR·CLARITY  CER TYPE  STATUS   PCS  PRICE  Amount │ │ header 52, #F9F9F9
│ │ v Sold to customers · must be purchased 2                          (#FAE6E4, 40)   │ │
│ │▌☐ 1 STK-000231 …                                     Sold                           │ │ rows 84 / 65
│ │ v Still in stock on memo · buy now or return later 3               (#F9F9F9, 40)   │ │
│ │  ☐ 3 STK-000331 …                                    In stock                       │ │
│ │ (empty space; the card fills the dialog height)                                       │ │
│ ├──────────────────────────────────────────────────── [Cancel] [OK] ─────────────────┤ │ footer 58, top line #DFE4E4
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Measured (E, CSS px at 1920 x 1080) | Existing `MemoStockModal` (C) | Rev 2 rule |
|---|---|---|---|
| Backdrop | rgba(23, 34, 34, 0.35): alpha 89/255 | `bg-[#1C252E]/40` | Keep the existing backdrop; it matches within tolerance. |
| Dialog box | x 144–1776, y 40–1040, so **1632 x 1000** (85 % of the width). White. The radius cannot be measured on the alpha edge; ≈8–12. | `max-w-[1480px] max-h-[90vh] rounded-2xl` | Width `min(1632px, 100vw − 48px)`. Height `min(1000px, 100vh − 80px)`, **fixed**, so the box does not jump when a filter changes. Keep the existing radius and shadow. |
| Title bar | ≈63 tall. Title at left 20, ≈18 px medium `#1C252E`. Close X `#1C252E`. Divider 1 px `#E6E6E8`. | `px-6 py-4`, `text-lg font-medium`, `border-[#E3E6EA]` | Keep; it matches within tolerance. Title "Add Memo Stock". |
| Body padding | 56 left and right; the toolbar sits 25 below the divider; 20 between the toolbar and the table; 24 below the card | `px-10 py-6`, `mb-5` | Use 56, 24 and 20. |
| Tabs (**new**) | Container 196 x 40, fill `#F9F9F9`. Active pill 36 tall, white, 1 px `#EDEDED`. Active label `#1C252E` with its count in `#637381`. Inactive `#637381`. ≈13 px. | none | Segmented tabs: All {n}, Sold {n}, In stock {n} |
| Search | 352 x 36, white, 1 px `#EDEDED`, radius ≈8, icon `#1C252E`, placeholder `#95A0A9` | `w-80 h-10 bg-[#F6F7F8]`, no border | The design's size and border. Placeholder **"Search Stock ID, lot, memo, invoice"**. |
| Date range | 181 x 36, 1 px `#EDEDED`, calendar icon "Start" → calendar icon "Due", text `#1C252E`; 20 gap after the search | `DateInput` pair, border `#E3E6EA` | Reuse `DateInput`. It filters the memo receive Doc Date: from ≤ to, ≤ 366 days (C, Q-MR-10). |
| Table card | 1519 wide, 1 px `#EDEDED`, radius ≈8. It holds the table and the footer. | same structure, `border-[#E3E6EA]` | Keep the structure. |
| Header row | **One row**, 52 tall, `#F9F9F9`. Titles uppercase ≈13 px medium `#1C252E`. Sub ≈11 px `#656B71`. Sort glyph `#8A939D`. "#" `#5F6873`. | two-row header with a "Pending" group | One row, as the design |
| Group header (**new**) | 40 tall. Sold fill **`#FAE6E4`**, In stock fill **`#F9F9F9`**. 1 px `#EDEDED` lines. Chevron `#1C252E` at left 12. Label ≈15 px medium `#1C252E`. | none | See the behaviour below |
| Item row | 84 tall with a note line, 65 without. Text starts ≈16 below the row line. Row line 1 px `#EDEDED`. Primary text `#1C252E` ≈14 px; Stock ID and Stone are medium. Secondary `#656B71` ≈12 px. Row # `#4E626C`. Note icon `MessageSquare` (sampled `#141B34`). | `py-4`, `border-[#EEF0F2]`, secondary `#6B7480` | Keep the shared values; they match within tolerance. |
| Sold row marker (**new**) | Left border **3 px `#DF1016`** (DV-10) | none | Sold rows only |
| Cer badge | fill `#F9F9F9` | `Badge` neutral `#EEF0F2` | Keep `Badge`. |
| Status badge (**new**) | Sold: fill `#FAE6E4`, text `#DF1016`. In stock: fill `#C1EFD2`, text `#22C55E`. ≈12 px, radius ≈4. | none | Fills as the design; text colours as DV-09 |
| Footer | 58 tall, top line `#DFE4E4`. Cancel ≈95 x 36, 1 px `#EDEDED`. OK 96 x 36, disabled fill `#7AB2B5`. Right padding ≈20. | `Button` and `Button primary min-w-24`, with "N selected" at the left | Keep, including "N selected" (C). It is not in the design but does no harm. |

Column start offsets from the card's left edge (E, ±4 px):

- checkbox 32 (20 x 20, 1.5 px `#EDEDED`)
- # 78
- Stock ID 107
- Location 360
- Stone 500
- Color · Clarity 640
- Cer Type 820
- Status 960

Right edges: Pcs/Weight 1220, Price 1348, Amount 1488.

When the dialog is narrower than 1632 px, the table keeps a minimum width of 1200 and scrolls sideways inside the card (C).

**Columns**

| # | Header (sub) | Cell | Data (C = `memoStock.list` today) |
|---|---|---|---|
| 1 | ☐ | Row checkbox. In the header: select all (see below). | — |
| 2 | # | A running number across both groups: 1–2 for sold, then 3–5 for in stock (E). A collapsed group keeps its numbers (04 shows 3, 4, 5). | — |
| 3 | **Stock ID** (Lot · Memo No.) | `stockId` (medium). Sub "{lot} · {memo receive no.}"; today's "from {docNo}" changes to this. Note line: `MessageSquare` + `itemNote`, when the item has a note. | C: `stockId`, `lot`, `memoReceive.docNo`, `itemNote` |
| 4 | **Location** | `location`. The second line is the piece type (Pair / Parcel / Single), shown **only when the API gives one** (DV-11). | C: `location` ("Memo"). Piece type: **requires-sa** R2-D-04 |
| 5 | **Stone** (Shape · Size) | `stone` (medium); "shape · size" | C |
| 6 | **Color · Clarity** (Cutting · Quality) | as today | C |
| 7 | **Cer Type** (Cer No.) | `Badge` + cer no. | C |
| 8 | **Status** (Sale Invoice · Customer). **New.** | Sold: badge "Sold", then "{invoice no.} · {dd/MM/yy}", then the customer name. In stock: badge "In stock", then "with us since memo" (DV-13). | **requires-sa** R2-D-01/02 |
| 9 | **Pcs** (Weight) | Pcs, with "{weight} cts" below it, right-aligned. This replaces the two "Pending" columns. | C: `pendingPcs`, `pendingWeightCt`. The quantity for sold rows is **requires-sa** R2-D-02. |
| 10 | **Price** (Unit) | Net unit price (Decimal Setup price places, C). Below it: "{currency} per cts" or "{currency} per pcs". | C: `netUnitPrice`, `currency`, `priceUnit` |
| 11 | **Amount** | Quantity x net unit price, as the server gives it | C: `amount` (pending). Sold rows: R2-D-02. |

Check of the source's arithmetic (E):

- 0.76 x 1,450.00 = 1,102.00
- 3.60 x 980.00 = 3,528.00
- 1.45 x 2,100.00 = 3,045.00
- 2.94 x 320.00 = 940.80

So **Amount = weight x unit price** for per-ct items. This matches `pendingAmount` (C).

**Behaviour**

- **Open.**
  - T-02 Memo Stock opens the dialog. It is blocked with a toast until a vendor and a currency are chosen (C).
  - Scope: the chosen vendor's items in the document currency (Q-PU-15, C). Rows already on the document are left out (C).
  - Focus starts in the search box (C, `autoFocus`).
- **Close.**
  - Close X, Cancel, Escape, or a click on the backdrop closes the dialog (C). Checked rows are dropped.
  - Focus returns to the button that opened the dialog (**A**). The current modal does not do this, so FE adds it.
  - Tab and Shift+Tab stay inside the dialog (**A**). This is new and needed for `aria-modal`.
- **Tabs** All / Sold / In stock.
  - They are a segmented control (`role="tablist"`; arrow keys move between tabs) that filters the table.
  - The counts are for the current search and date range, and come from the server (requires-sa R2-D-03). Until the server returns counts, the FE counts the loaded rows and adds "+" while more pages exist (**A**).
  - Changing the tab, search or dates **keeps the checked rows**. OK adds every checked row, including rows hidden by the current filter (**A**). Today's modal adds only the checked rows that are visible. "N selected" counts all of them.
- **Groups.**
  - "Sold to customers" comes first, then "Still in stock on memo" (E).
  - Both are **expanded when the dialog opens** (**A**). 04 is an example of a collapsed group.
  - The whole header row is a `button` with `aria-expanded`. Enter, Space or a click toggles it. The chevron points down when the group is open and right when it is closed.
  - Header text: "Sold to customers · must be purchased {n}" and "Still in stock on memo · buy now or return later {n}" (E). {n} is the group's count for the current filters.
  - A group with 0 rows is hidden (**A**). The Sold tab shows only the Sold group, and the In stock tab only the In stock group.
- **Select all** (the header checkbox) checks every loaded row in the **expanded** groups of the current tab (**A**). It is disabled when there are no rows.
- **Row.** A click anywhere on the row toggles it (C). The checkbox's label is "Select {Stock ID} from {memo no.}" (C). Hover and checked look as they do today (DV-08).
- **"Must be purchased"** is information only. Sold rows are **not** pre-checked, and nothing forces the user to pick them (**A**, Q-PU-17).
- **Paging.** 50 rows a page, with Load more under the last group (C). The server orders the rows Sold first, then by memo receive date, newest first (requires-sa R2-D-03). That way a later page never puts a sold row above in-stock rows already shown.
- **States.**
  - Loading: "Loading…" (C).
  - Error: the shared Memo Stock load error (C `memoStockLoadError`).
  - Empty, per tab:
    - All: "No memo stock from this vendor in {currency}." (C)
    - Sold: "No sold items waiting to be purchased." (**A**)
    - In stock: "No items in stock on memo." (**A**)
    - With a search or date filter: "Nothing matches your search." (**A**)
- **OK.**
  - It is disabled until at least one row is checked (E, C).
  - It adds the rows, filling empty rows first (C), and shows the toast "Added N items from Memo Stock" (C).
  - Each row starts at its cap quantity and the net unit price (R2-03). A sold row's cap is its sold quantity that has not yet been purchased (requires-sa R2-D-02).

**Reuse versus new.** Compared with `frontend/src/features/trade-document/memo-stock-modal.tsx` and `memo-stock-api.ts` on 2026-11-04:

| Part | Reuse as is | Changed for Purchase | New |
|---|---|---|---|
| Dialog shell: backdrop, `role="dialog"`, `aria-modal`, title id, Close `IconButton`, Escape | ✓ | size (1632 x 1000), body padding 56 | focus return, focus trap |
| Search with a 250 ms debounce; `DateInput` Start → Due | ✓ logic | white box with a border; placeholder | invoice search (server) |
| `useMemoStock` infinite query, 50 a page, Load more, `memoStockLoadError` | ✓ | The input adds `status`. The output adds status, sale and counts (requires-sa). | — |
| Row toggle, hover, checkbox label, "N selected", OK disabled until a row is checked | ✓ | checked rows kept across filters | — |
| Stock ID / Stone / Color / Cer cells, `Badge`, the format helpers (`formatWeight`, `formatUnitPrice`, `formatMoneyText`, `useNumberFormat`) | ✓ | Stock ID sub "Lot · Memo No." | — |
| Header | — | one header row (no "Pending" group) | — |
| Pcs/Weight, Price/Unit cells | — | Pcs stacked over Weight; "{cur} per cts" | — |
| Tabs with counts | — | — | ✓ |
| Collapsible status groups; sold row marker | — | — | ✓ |
| Status column | — | — | ✓ (data is requires-sa) |
| Location second line | — | — | ✓ (data is requires-sa, optional) |

**Implementation shape** (**A**, for FE):

- Do not change `MemoStockModal`. Memo Return and Memo Out From Stock use it, and those pages must look the same as before (TC-PU-07).
- Build one Purchase picker shell under `frontend/src/features/purchase/components/`.
  - It takes the title, the tab definitions, a group function, the column definitions, a row renderer and a data hook.
  - It holds the toolbar, the grouped table, the footer, keyboard handling and focus.
- Two thin pickers use the shell: Memo Stock (R2-MS) and Purchase Order (R2-PO). They reuse the shared pieces listed above.
- No new package.
- Whether Memo Return should later get the new look is Q-PU-23.

### R2-PO Add Purchase Order dialog (no design; same family, **A**)

There is no image of this dialog. It uses the R2-MS shell, sizes, colours and behaviour, with these differences (Q-PU-20):

| Part | Add Purchase Order |
|---|---|
| Title | "Add Purchase Order" |
| Scope | Lines of **Approved** POs for the chosen vendor, in the document currency, that still have an open quantity: purchased < ordered for pcs or weight (C, SA-PO-05). Lines already on the document are left out. |
| Tabs | All {n} / Open {n} (nothing bought yet) / Partly purchased {n} |
| Search | "Search PO No., lot, stone, cer no." |
| Start → Due | Filters the PO Doc Date, ≤ 366 days |
| Groups | **One group per PO**, newest PO first. Grey `#F9F9F9` header: "{PO No.} · {Doc Date dd/MM/yy} · Due {dd/MM/yy}  {n}", collapsible. There is no pink group, because a PO line is never "sold". |
| Col 3 | **PO Line** (Lot): "Line {n}", with the lot below it and the note line. There is no Stock ID, because PO lines have none (C). |
| Col 4 | Location: the PO line's free-text location (C, Q-PO-06) |
| Cols 5–7 | Stone / Color · Clarity / Cer Type: as R2-MS (C; PO lines carry the same attributes) |
| Col 8 Status | "Open" (neutral `Badge`) or "Partly purchased" (amber: fill `#FDF1DC`, text `#B4540A`, the existing `Badge lot` colours, C). Below it: "Ordered {pcs} pcs · {wt} cts". |
| Col 9 Pcs (Weight) | The **open** quantity: ordered − purchased |
| Cols 10–11 | The PO net unit price (after the PO line discount) as "{cur} per cts". Amount = open quantity x net unit price. |
| OK | Adds the rows and shows the toast "Added N items from Purchase Order". Each row gets:<br>• Stock ID "Auto" (R2-05)<br>• attributes, lot, location, cer and item note copied and locked<br>• Pcs and Weight starting at the open quantity<br>• Price starting at the net unit price (R2-03)<br>PO photos are **not** copied (Q-PU-11, **A**). |
| Empty | "No open purchase order lines from this vendor in {currency}." |

### R2 data needs (all **requires-sa**; the FE must not invent these)

| ID | Need | Today (C) | Blocks |
|---|---|---|---|
| R2-D-01 | **What "Sold to customers" means, and where the sale data comes from**: invoice no., invoice date and customer name for each sold item. | No Sale Invoice table or service exists in `backend-api-master` (checked `prisma/schema.prisma` and `src/**`). `memo_stock.sold_*` exists, but no service writes it. Memo Outstanding › Customer reports sold as 0. | Status column, Sold group, Sold tab |
| R2-D-02 | For each item: a `status` (SOLD / IN_STOCK), with the quantity and amount for each status. Is a partly sold item one row per status, or one row? The cap for a sold row (its sold quantity not yet purchased). How purchasing a sold row moves the buckets (together with Q-PU-03). | `memoStock.list` returns only items with pending > 0, with only the pending quantity and amount. | Row cap, mapping, approve |
| R2-D-03 | `memoStock.list` (or a Purchase-specific query) needs: a `status` filter, **counts per status** for the current filters, Sold-first order, invoice no. in `q`, and the `purchase:VIEW` grant. Counts must stay bounded (one vendor + currency on the partial index). | No count. The order is receive date, then Stock ID. `q` matches Stock ID, lot, stone, cer no. and memo no. Only Memo Return and Memo Out have the grant. | Tabs, paging |
| R2-D-04 | A piece type (Pair / Parcel / Single) and a real location for each memo item, **only if** the owner wants the second Location line now | Neither exists. | Location second line (optional, Q-PU-19) |
| R2-D-05 | **An open-PO-lines query** for a vendor + currency: paging ≤ 50, `q`, a Doc Date range, a status filter (Open / Partly purchased) with counts, the PO header fields for the group row, ordered and purchased quantities, and the net unit price. Grant `purchase:VIEW`. | `purchase_order_line.purchased_*` and SA-PO-05 define "open", but no query lists open lines. | R2-PO, R2-01a |
| R2-D-06 | A purchase line references a `memoStockId` **or** a `purchaseOrderLineId`. The server re-reads caps and prices and does not trust the browser. Approve increments `purchase_order_line.purchased_*` under a row lock, with a CHECK ≤ ordered. Stock ID assignment for PO rows (with Q-PU-05). | The PU contract is not written yet (BE-PU-001). | FE-PU-003/004/009 |
| R2-D-07 | The picked-row edit rule: the server checks that a picked line differs from its source only in Pcs, Weight and Price (R2-03). | — | Save |

Capacity (4 GB / 2 vCPU):

- No new package or container.
- The two pickers are one route chunk, loaded when a dialog opens (**A**: `next/dynamic` or a lazy import).
- Server work is bounded: ≤ 50 rows a page, counts on one vendor's partial index, ≤ 200 lines a document.

### R2 accessibility

- Tabs: `role="tablist"` / `tab` with `aria-selected`. The count is part of the accessible name ("Sold, 2").
- Group headers: a `button` with `aria-expanded`, and `aria-controls` pointing to the group's rows (`tbody`).
- The status is given as **text** in the badge. Colour and the red row marker are extra cues only.
- Badge text colours follow DV-09.
- The OK button's disabled state is announced. "N selected" is in an `aria-live="polite"` region (**A**).
- Escape closes the dialog, focus is trapped inside it, and focus returns to the trigger (R2-MS behaviour).

### R2 out of scope

- the Purchase Outstanding page
- restyling the Memo Return and Memo Out pickers (Q-PU-23)
- sorting
- a location master and piece types, unless Q-PU-19 says otherwise
- creating a Sale Invoice. If R2-D-01 needs one, SA proposes it separately.

## Revision 3: picker Ref. / Memo ID / PO No. columns (owner 2026-11-04)

Approval evidence: direct owner instructions 2026-11-04 (with screenshots 21–23 of the current Add Memo Stock, the current Add Purchase Order and the reference Add From Stock design). They select and authorize this scope:

1. "ปุ่ม fromstock ใน Header ให้เพิ่ม Ref. เข้ามาโดยจะอ้างอิง transaction no ถ้ามาจาก memo ก็เขียน memo no ของเอกสารนั้นถ้ามาจาก load ก็เขียนว่ามาจากใบ Load ไหน (แต่ว่าตอนนี้ยังไม่มีหน้า load ให้ทำรองรับเพื่อในอนาคต)"
2. "ปุ่ม Memo Stock ให้ Header จาก Stock ID เป็น Memo ID และให้ Memo ID ขึ้นมาแทน Stock ID ก็คือสลับตำแหน่ง Memo ID กับ Stock ID"
3. "Modal Add Purchase Order ยังทำผิด PO Line เปลี่ยนเป็น PO no. และให้มัน UI เหมือน from stock ปกติเลย แต่แค่เปลี่ยนเป็น PO no จาก Stock ID"

| ID | Picker | Change |
|---|---|---|
| R3-01 | Shared **Add From Stock / Add Memo Stock** (`MemoStockModal`: Quotation From Stock, Reserve, Memo Out, Memo Out Return, Memo Return) | New first data column **Ref.** (sub "Doc Date"): the bold transaction no. with its Doc Date (dd/MM/yyyy) under it. Source: the item's `ref` (`MEMO_RECEIVE` or `LOAD`, additive API field); the item's `memoReceive` is the fallback. A `LOAD` ref renders the same way with a small "Load" hint (no Load page yet; future-proof). The "from {Memo No.}" sub-line under Stock ID is removed; the vendor code stays there when every vendor is listed. |
| R3-02 | Purchase **Add Memo Stock** (R2-MS) | First column header **Memo ID** (sub "Stock ID · Lot"). The cell swaps: the memo doc no. is the bold top line, "{Stock ID} · {Lot}" under it, then the note line. Tabs, Sold / In stock groups and the Status column are unchanged. |
| R3-03 | Purchase **Add Purchase Order** (R2-PO) | Looks like the normal From Stock picker (screenshot 23): a flat list in server order, **no tabs, no PO group rows, no Status column**. Columns: **PO No.** (sub "Doc Date": bold PO no., PO Doc Date under it), **Stone Code** (sub "Stock ID · Lot": the PO line's stone code, then "Auto" (no Stock ID yet, R2-05) and the lot badge, then the note), Location, Stone, Color · Clarity, Cer Type, Pcs (Weight) = open quantity, Price (Unit), Amount. Search, Start → Due, Load more, selection and OK are unchanged; the query keeps `status: "ALL"`. This supersedes the R2-PO Tabs, Groups, Col 3 and Col 8 rows. |

