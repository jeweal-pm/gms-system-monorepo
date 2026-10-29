# UI specification: memo-receive

- Feature ID / revision: `memo-receive` / 2
- Status: **approved** 2026-10-28 (owner answers Q-MR-01…07; frontend only: existing master APIs, mock documents)
- Revision 2 (owner 2026-10-28, verbatim): "1. หน้าMemo receive เอาพวก Quantity & Price Discount (%) Discount Amt และ Summary Value เอา Discount กับมาเหมือน quotation เลย 2.ในหน้า memo receive ไม่มี stone code ปรับให้เหมือนแบบนำ StockID ขึ้นมาแทน" → pricing and both discounts as Quotation; no Stone Code anywhere; Stock ID leads the row.
- Owner request (2026-10-28, verbatim): "ออก adr หน้า ทำตาม design memo receive ให้หน่อย ยังไม่ต้องต่อหลังบ้าน ข้อมูลขอเป็น mock ให้หมดก่อน เพราะยังไม่มี flow เกี่ยวกับหน้านี้ว่าทำอะไรบ้าง STOCK ID จะคีย์ไม่ได้ จะเป็น Running ไม่สามารถกรอกข้อมูลเองได้ เพราะระบบจะรันหมายเลขให้อัตโนมัติ (Running Number)"
- Source: [01-memo-receive-design.png](source/01-memo-receive-design.png) (page + row panel, scrolled to Quality and Pricing / Photos / Note), [02-row-panel-info.png](source/02-row-panel-info.png) (row panel top: Stock ID / Lot / Location). Parts not visible in the design reuse the Quotation page and are marked **A** (assumption).
- Decision record: [ADR-0033](../../../adr/0033-memo-receive-frontend-mock.md); answers: [open-questions.md](open-questions.md); TODO: [memo-receive.md](../../../task/todo/memo-receive.md)

## Page structure

Route `/memo/memo-receive` (new) and `/memo/memo-receive/[id]` (saved). Breadcrumb Home › Memo › Memo Receive.
Same frame as Quotation:

```
[ Header: "Memo Receive No.:"  MIGMS2609001 [Pending Approval] [scan]   Print Excel Duplicate Refresh ]
[                                         [+ Create New] [Cancel] [Save] [Edit] [Delete]            ]
[ Info: Doc Date* | Vendor* | Address*                                                              ]
[       Due Date* | Currency* | Exchange Rate (read-only) | Ref.                                    ]
[ Item  N rows  [scan]                                                                              ]
[ Photo box (selected row) | Item table (5 empty rows) … Totals   [+ Add row]                        ]
[ Document Note (0/250)                         | Summary Value                                     ]
[                                               |  Subtotal / Tax / Other Charge / Grand Total      ]
[ Right rail: Daybook, Summary Value                                                                ]
```

- A short note under the header: "Preview: memo receives are kept in this browser only."
- Spelling fixes from the design (DV): "Vender" → **Vendor**, "Rfe." → **Ref.**

## Header (H)

| ID | Element | Rule |
|---|---|---|
| H-01 | Memo Receive No. | New: grey preview from Document Setup (`memo-receive` row in effect on the Doc Date; plain 1, 2, 3 without one, Q-MR-02) with "Number preview — the number is issued when you save". Saved: the issued number and the status badge **Pending Approval** (Q-MR-05). |
| H-02 | Print, Excel | Disabled (out of scope). |
| H-03 | Duplicate | Copies the document as a new unsaved one; Stock IDs are cleared (assigned again on save). |
| H-04 | Refresh | Reloads the saved document. |
| H-05 | Create New / Cancel / Save / Edit / Delete | Same as Quotation (`memo-receive` ADD/EDIT/DELETE). Delete asks to confirm. Edit and Delete only until approved (Q-MR-05). |

## Info form (I)

| ID | Field | Control | Rule |
|---|---|---|---|
| I-01 | Doc Date * | date | Default today |
| I-02 | Due Date * | date | Empty; must be on or after Doc Date |
| I-03 | Vendor * | select | Active vendors from Setup › Vendor (`vendor.list`) as `code · name`; choosing one loads it (`vendor.get`) and picks its default address and its currency, like Customer on Quotation (Q-MR-06) |
| I-04 | Address * | select | Addresses of the selected vendor; empty until a vendor is chosen |
| I-05 | Currency * | select | Setup › Currency (`currency.options`); default company currency |
| I-06 | Exchange Rate | read-only | The currency's rate (Setup › Currency); empty for the company currency |
| I-07 | Ref. | text ≤ 100 | Optional |

## Items (T): table

- Title "Item", "N rows", scan button (A). **No From Stock** button (stones come from the vendor).
- Starts with 5 empty rows ("Empty row · click to key in"); **+ Add row** adds one (max 100 rows).
- Columns as Quotation, except the first (rev 2): ☐ · remove · # · **STOCK ID** (sub: LOT) · Location · Stone · Color · Clarity · Cer Type · PCS · Weight (ct) · Sale Price (sub: unit, line discount) · Amount · More.
- An unsaved line shows "Auto" (grey) in the Stock ID column; the Lot shows below it.
- Totals row: PCS, Weight, Amount (with currency).
- Clicking a row opens the row panel; the left photo box shows the selected row's photos (view + zoom) and Item Note.

## Row panel (P)

Header "Row x of N", ▲ ▼, ✕, title "New item" (or "Stock ID n" once saved). Footer: Remove row · Close · Next row.

| ID | Section | Field | Control | Rule |
|---|---|---|---|---|
| P-01 | **Info** | Stock ID | read-only | **Running number, cannot be typed** (owner). Before save: "Auto" + hint "Assigned when you save". After save: the number, plain 1, 2, 3 … (Q-MR-01). |
| P-02 | Info | Lot | text ≤ 30 | Optional, placeholder "e.g. L-2609-001" |
| P-03 | Info | Location | select | Mock location list (Q-MR-03, until a location master exists); optional |
| P-04 | Stone | ~~Stone Code~~ | — | **Removed in rev 2** (no stone code on Memo Receive) |
| P-05 | Stone | Stone, Shape, Size | selects | Stone Master (`stoneMaster.options`) |
| P-06 | Stone Quality | Color, Clarity, Cutting, Quality | selects | Stone Master (`stoneMaster.options`) |
| P-07 | Certificate | Cer Type, Cer No. | select + text ≤ 60 | Optional |
| P-08 | Quantity & Price | PCS | number, whole | As Quotation (rev 2) |
| P-09 | Quantity & Price | Weight (ct) | number, 3 dp | |
| P-10 | Quantity & Price | Price Unit | select per cts / per pcs | Default per cts |
| P-11 | Quantity & Price | Sale Price; Discount (%) + Discount Amt | number, 2 dp; discount pair as Quotation | % ≤ 100; typing either fills the other |
| P-12 | Photos 0 / 5 | photos | Add files / drag and drop, 4 small slots, set main | JPEG/PNG ≤ 5 MB, up to 5 per line; **kept in memory only** in this revision |
| P-13 | Note | Note | text ≤ 250 | Placeholder "e.g. Unheated, reserved for client viewing" |

A line counts when it has a stone; empty lines are ignored on save.
At least one line is required to save.

## Document note and Summary Value (S)

- Document Note: textarea ≤ 250 with counter (design 0/250).
- Summary Value (design): **Subtotal**; **Tax** checkbox → "Include tax in price" and the breakdown box (Price before tax / Tax [rate %] / Total amount), as Quotation; **Other Charge**: Service Charge, Labor; **Grand Total**. Rev 2: **Discount** (% / amount) and Total after Discount as Quotation.
- Money values show the document currency code.

## Right rail (R)

Daybook (saved mock memo receives, newest first, click to open; orange dot = Pending Approval) and Summary Value, as Quotation.

## States

- View / Edit modes as Quotation; Cancel with unsaved changes asks to discard.
- Saving shows "Saving…" then a toast; a new document opens at `/memo/memo-receive/<id>`.
- Not found (`/memo/memo-receive/<unknown id>`): "This memo receive doesn't exist."
- A master list that can't load (no permission, network) shows a short message on that field.

## Accessibility

Labels on every input; the read-only Stock ID keeps its hint linked with `aria-describedby`; dialogs and
menus reuse the existing Quotation components.

## Out of scope (revision 1)

Memo Receive API/database, stock posting, memo return/payable flow, From Stock, Print/Excel, the Approve
page, cancel, permission catalog changes, Decimal Setup use, a location master.

## Revision 3 (owner 2026-10-29, approved with SA revision 1)

Owner (verbatim in [ADR-0034](../../../adr/0034-memo-receive-approval-and-memo-stock.md)). This revision changes these items. Everything else stays as revision 2.

- **Data**: real API (`memoReceive.*`), and the mock store is removed. Field lists come from `memoReceive.options`.
- **Stock ID**: the server assigns `YY####` (e.g. `260001`) on save. Before save the field shows "Auto", and a line keeps its number when the document is edited.
- **Location**: removed from the item table column and from the row panel (P-03). It is stored as `Memo` on Memo Stock.
- **Approve** (header, temporary until the Approve page): shown when the status is Pending Approval, the document is saved with no unsaved changes, and the user has `memo-receive:APPROVE`. Confirm dialog "Approve this Memo Receive? Its N items move to Memo Stock and it can no longer be edited." → toast "Approved". Then the status badge reads Approved, and Edit, Delete and Approve are hidden.
- **Photos**: the row-panel photo box shows "Photos come in a later update", as on Memo Out (no upload in this revision).
- Questions: Q-MR-08…13 in [open-questions.md](open-questions.md).

## Revision 4 (owner 2026-10-29, approved with SA revision 2)

Owner: "ทำให้เพิ่มรูปได้เลยได้ไหม". The row-panel photo box works as it does on Quotation: Add files or drag and drop, up to 5 JPEG/PNG per item at 5 MB each, the first photo is the main photo, click to enlarge, and remove. The "come in a later update" note is removed. The left item card shows the main photo of the selected row. Photos become read-only once the document is Approved.
