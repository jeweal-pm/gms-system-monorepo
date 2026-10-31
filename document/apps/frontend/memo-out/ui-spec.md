# UI specification: memo-out

- Feature ID / revision: `memo-out` / 1
- Status: **implemented with its API** (2026-10-28, [SA rev 1](../../backend/master/memo-out/decisions.md), [ADR-0033](../../../adr/0033-memo-documents-in-master-service.md)). The "page structure only" notes below describe revision 1 before the API; now saving, numbers from Document Setup, the row panel and the daybook work, while photos, From Stock / Memo Outstanding and stock stay for later. Owner 2026-10-28: "uxui ทำ spec ของ Memo Out ให้หน่อยและ frontend ขึ้นหน้าโครง Memo Out ให้หน่อย". The request covers this spec and the page structure (FE-MO-001). Saving, numbering and stock need an SA revision and owner approval first (FE-MO-002…004 `requires-sa`, open questions Q-MO-01…08).
- Source: owner GMS design [source/01-memo-out-new.png](source/01-memo-out-new.png), 1920×1080, SHA-256 prefix `03ad465b59cdc890` (new document). Other states follow the Quotation page.
- Bundle: this file, [open-questions.md](open-questions.md), [testing.md](testing.md); central TODO [`task/todo/memo-out.md`](../../../task/todo/memo-out.md).
- No new package. Reuses the Quotation page components (`features/quotation/components/**`): header, header fields, item table, photo box, document note, summary value and right rail.

## What Memo Out is

Stones sent to a **customer** on memo (consignment out). The customer holds them until they buy (later a Sale) or return them (Memo Out Return). Same document shape as Quotation: customer, shipping and invoice address, currency, items, summary.

## Route and navigation

`/memo/memo-out` (new document). After the API exists, `/memo/memo-out/[id]` opens a saved one. Sidebar Memo › Memo Out links here and stays active on both. Breadcrumb: Home › Memo › Memo Out.

## Layout (source 01)

```
[ Memo Out No.: MOGMS2609001 [scan]              print · excel · duplicate · refresh ]
[                                    [+ Create New] [Cancel] [Save] [Edit] [Delete]   ]
[ Doc Date* | Customer*        | Shipping Address*     | Invoice Address*             ]
[ Due Date* | Currency*        | Exchange Rate (ro)    | Ref.                         ]
[ Item  5 rows  [From Stock] [scan]                                       | rail      ]
[ [photo box]  [item table, 5 rows visible, Totals]                       | daybook   ]
[              [+ Add row]                                                | summary   ]
[ Document Note                                   Summary Value                       ]
```

The header grid, table columns, empty-row text ("Empty row · click to key in, or use From Stock to fill it"), photo box, document note, summary and rail are identical to Quotation. Only the labels change: "Memo Out No.:", the Create New target, and the note hint "Printed on the memo out for the customer".

## Fields and rules (for the API step)

| Field | Rule |
|---|---|
| Doc Date\* | date, default today |
| Due Date\* | date by which the customer returns or buys; ≥ Doc Date; chosen by the user |
| Customer\* | active customers "CODE · Name"; choosing one picks its default shipping and invoice addresses and its currency |
| Shipping Address\* / Invoice Address\* | the customer's SHIPPING / INVOICE addresses |
| Currency\* | active currencies (Setup › Currency); a new document starts in the company currency |
| Exchange Rate | read-only, the currency's Selling Rate (sending to a customer, Q-MO-03); empty for the company currency |
| Ref. | ≤ 100 characters |
| Items | as Quotation; **From Stock** picks items that are in stock (Q-MO-02) |
| Document Note | ≤ 500 characters (the design counter shows 250, Q-MO-06) |
| Summary Value | as Quotation |

## Page structure only (revision 1, FE-MO-001)

- The page shows the full layout with a new, empty document: today's date, 5 empty rows, totals 0.00, and the company currency once known.
- **Save, Edit, Delete, Duplicate and Refresh are disabled.** A notice under the number reads "Page preview — saving Memo Out comes with its API." The number shows "New Memo Out".
- The Customer and address lists are empty until the API provides them. The Currency list and the Exchange Rate come from Setup › Currency when the user can read it.
- **From Stock** is shown as in the design but disabled ("Stock isn't available yet"), as on Quotation.
- Selecting a row doesn't open the row panel yet. It shows "Item entry comes with the Memo Out API."
- The rail opens Summary Value (live totals) and an empty Daybook ("No memo outs yet").
- Permission: the page needs `memo-out:VIEW` (existing catalog leaf). Otherwise it shows "You don't have permission to view memo outs."

## Revision 2 (2026-10-31): From Stock and approval — **approved** (owner 2026-10-31: "อนุมัติ memo-out revision 2")

Owner 2026-10-31 (verbatim): "sa frontend backend Memo Out คือการตัดของจาก from stock โดยของจาก from stock จะมาจาก memoin และเมื่อทำ flow ของ Memo Out เสร็จของจะถูกตัดจริงๆ". The answers are Q-MO-09…12 in [open-questions.md](open-questions.md). The backend is [SA revision 2](../../backend/master/memo-out/decisions.md). No new screen design was supplied, so the layout stays as source 01, and the From Stock dialog reuses the Add Memo Stock / Quotation From Stock layout.

### From Stock (enabled)
- The **From Stock** button and a click on an empty row's "use From Stock" open the **From Stock** dialog. It works without a customer, because Memo Out stock isn't tied to the customer.
- The dialog lists Memo Stock items with something pending, from every vendor, newest receive first, 50 at a time with Load more.
  - Columns: checkbox, #, Stock ID · Lot ("from {Memo Receive No.} · {vendor code}"), Location (`Memo`), Stone · Shape · Size, Color · Clarity / Cutting · Quality, Cer Type · Cer No., Pending Pcs / Weight.
  - Search: "Search Stock ID, Lot, Stone, Cer No.". Start → Due filters the Memo Receive Doc Date.
  - Items already on the document are left out.
- OK adds the checked items. They fill the empty rows first, then are appended. The toast reads "Added N items from Stock".

### Stock rows
- The first column shows the Stock ID.
- Location `Memo` and the stone and certificate fields are copied from Memo Stock and are **read-only**, in the table and in the row panel.
- **Pcs / Weight** start at the item's full pending and can be lowered to part of it (Q-MO-10).
  - Pcs fills Weight in proportion (pending weight × pcs ÷ pending pcs, 2 dp); Weight stays editable.
  - They are numbers only, at most the item's pending, and pcs or weight must be > 0.
  - The row panel shows "Pending {pcs} pcs / {weight} ct" under them.
- **Sale Price** starts empty and is required (Q-MO-11): "Enter the sale price". Discount and item note work as on Quotation.
- Remove, Clear and Duplicate act as on Quotation. A duplicated stock row is refused on save as a duplicate item, so Duplicate is hidden on stock rows.

### Manual rows (Q-MO-09)
- Add row and clicking an empty row's "key in" work as today. Manual rows cut nothing from stock.

### Status and Approve
- After save the document shows a **Pending Approval** badge (orange). Edit and Delete work only while it is pending.
- An **Approve** button shows for a saved Pending Approval document in view mode, with no unsaved changes, for users with `memo-out:APPROVE`.
  - Confirm text: "Approve this Memo Out? Its {n} stock items are cut from Memo Stock and it can no longer be edited." With no stock rows: "…It has no stock items, so nothing is cut."
- After approval the document shows an **Approved** badge (green), is read-only, and has no Edit or Delete.
- If another document took the stock first, the message reads "Some stock items no longer have enough pending. Edit the row and approve again." The document stays Pending Approval.
- The daybook dot is orange for pending and green for approved, as on Memo Receive.

### Not in revision 2
- Memo Out Return putting stock back (Q-MO-12).
- Sale.
- Our own stock in From Stock (inventory).
- Line photos.

## Revision 3 (2026-10-31): From Stock rows only — owner instruction

Owner 2026-10-31 (verbatim): "Q-MOR-13 ไม่ใช่คือหน้า memoout ทำผิดฝากเเก้ด้วยคือพิมไม่ได้เลยเเต่เเรกต้องเป็นของที่มาจาก from stock เท่านั้นเอาปุ่ม add row ออกด้วย". A direct instruction to fix the page; it replaces the revision 2 answer to Q-MO-09.

- No **Add row** button. Clicking an empty row opens **From Stock** instead of the row panel ("Empty row · click to pick From Stock").
- The row panel opens only for picked rows; it edits Pcs / Weight (≤ pending), Sale Price, discount and item note, as revision 2. Next row stops at the last row instead of adding one.
- Duplicate stays hidden (an item appears once per document). Clear empties a row, which is then filled from From Stock.
- The server rejects a line without `memoStockId` (`VALIDATION_ERROR lines.N.memoStockId required`).
