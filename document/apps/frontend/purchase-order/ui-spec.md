# UI specification: purchase-order revision 1

- Feature ID / revision: `purchase-order` / 1
- Status: **approved** 2026-11-04 (owner 2026-11-04: "อนุมัติ purchase-order revision 1"; owner answers Q-PO-01/06/09/12 the same day)
- Owner request 2026-11-04 (verbatim): "designยังไม่เสร็จเเต่ หน้าเหมือน quotation เลยเเต่ในหน้า purchase order มี approve approveเพื่อส่งรายการสินค้าไปซื้อเข้าในหน้าpuchase หน้า purchase order ไม่สามารถดึงมาจากปุ่ม form stock หรือ memo stock ได้ต้องสร้างเองเท่านั้น"
- Sources:
  - The current Quotation page (layout, item table, row panel, Summary Value).
  - The Memo Receive page (vendor header and the Approve button on the page).
  - No Figma yet. When the design arrives it becomes UI revision 2 (Q-PO-13).
- Questions with proposed defaults: [open-questions.md](open-questions.md). Tests: [testing.md](testing.md).
- Backend: [SA revision 1](../../backend/master/purchase-order/decisions.md), [ADR-0041](../../../adr/0041-purchase-order-document.md). Flow: [diagram/purchase-order-flow.md](../../../diagram/purchase-order-flow.md). TODO: [task/todo/purchase-order.md](../../../task/todo/purchase-order.md).
- No new package. The page reuses the Quotation item table, row panel, photos, note and Summary Value (`DocumentKind`), and the shared vendor header (`trade-document/vendor-info-form.tsx`).

## Route and menu

- Route `/purchase/purchase-order` (the existing menu leaf **Purchase Order › Purchase Order (PO)**, slug `purchase-order`, stops being a placeholder).
- The page opens a new PO; `/purchase/purchase-order/[id]` opens a saved one, like Memo Receive.
- Access uses the existing permission leaf `purchase-order`.

## Layout

The page is the Quotation page with these differences:

| Part | Purchase Order |
|---|---|
| Title / doc number | "Purchase Order", number from Document Setup key `purchase-order` (code `PO`), or plain 1, 2, 3 … without a setup row |
| Party | **Vendor** (active) and one vendor address, as on Memo Receive (owner 2026-11-04, Q-PO-01). No shipping/invoice pair. |
| Header fields | Doc Date, Due Date (required, ≥ Doc Date, no default), Vendor, Address, Currency, Exchange Rate (foreign currency only), Ref |
| Status badge | "Pending Approval" (amber) after save, "Approved" (green) after approve |
| Header buttons | Save, Edit, Delete, **Approve**. No Send for Approval, Reject or Cancel (Q-PO-02/03). Print and Excel stay disabled. |
| Items toolbar | "Item N rows" and **Add row** only. **No From Stock button** and no picker (Q-PO-05). |
| Summary Value, Document Note, Daybook | Same as Quotation. Document Note hint: "Printed on the purchase order for the vendor". Daybook: newest first, Approved dot green, Pending amber. |

## Items

All rows are keyed in (Q-PO-05):
- Clicking an empty row opens the row panel. Empty-row text: "Empty row · click to key in".
- Row fields are the Quotation typed row: Stone Code (autocomplete), Stone, Shape, Size, Color, Clarity, Cutting, Quality, Lot, Location, Cer Type, Cer No., Pcs, Weight, Price Unit, Price, Discount (%) / Discount Amt, Amount, Item Note, photos (≤ 5).
- **Location** is a free-text column and row-panel field (≤ 40), as on the Quotation typed row (owner 2026-11-04, Q-PO-06).
- **No Stock ID** column or field. Stock IDs are issued later, when the goods are purchased (Purchase page).
- Row menu: Duplicate, Remove.
- 1–200 filled rows; the server computes all totals.

## Status and actions

| Status | Who | What the user can do |
|---|---|---|
| New | `purchase-order:ADD` | Fill in and **Save** → the PO is saved as **Pending Approval** with its number |
| Pending Approval | `EDIT` | **Edit** → change anything → Save |
| Pending Approval | `DELETE` | **Delete** (confirm) |
| Pending Approval, saved, no unsaved changes | `APPROVE` (the creator may approve their own PO) | **Approve** → confirm "Approve this Purchase Order? Its N items are sent to Purchase and it can no longer be edited." → toast "Approved" |
| Approved | `VIEW` | Read only. Edit, Delete and Approve are hidden. |

Approving sends the PO's items to Purchase: each item becomes **waiting to be purchased** for its full Pcs / Weight (Q-PO-04). Nothing goes into stock or Memo Stock at this point. The Purchase (PU) page, built later, picks these items and records what was bought.

## Errors

- Someone else changed the PO (`PURCHASE_ORDER_CHANGED`): "This purchase order was changed by someone else. Reload to see the latest."
- Wrong status (`PURCHASE_ORDER_STATUS_INVALID`), e.g. already approved: "This purchase order is already approved." and the page reloads it.
- Inactive vendor, address or currency (`PURCHASE_ORDER_REFERENCE_INVALID`): the field shows the error.
- Field errors name the row: "Row N: …".

## Not in revision 1

- The Purchase (PU) page and taking items from a PO into it.
- The Purchase Outstanding report.
- Reject, cancel or un-approve an approved PO; partial approve.
- Print / Excel output; hiding prices without PRICE.
- The Figma design (UI revision 2).
