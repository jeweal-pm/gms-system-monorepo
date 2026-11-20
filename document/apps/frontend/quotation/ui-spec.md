# UI specification: quotation revision 2 (From Stock)

- Feature ID / revision: `quotation` / 2. Revision 1 is the Quotation page built under [ADR-0025](../../../adr/0025-quotation-frontend.md) and connected to the API under [ADR-0032](../../../adr/0032-quotation-backend-in-master-service.md). This revision changes only From Stock.
- Status: **approved** 2026-11-03 (owner 2026-11-03: "อนุมัติ quotation revision 2 Memo Outstanding ไว้ก่อน")
- Owner request 2026-11-03: "ต่อปุ่ม from stock ใน quotation". Owner answers the same day: "ปุ่ม From Stock แบบเดียวกับ Memo Out คือ มาจาก memostock + stockเราเอง … แค่ดึงรายละเอียดของมาใส่ในใบเสนอราคา ไม่ตัดยอดอะไรทั้งนั้นไม่ approve ด้วย". The questions and proposed defaults are in [open-questions.md](open-questions.md).
- Sources:
  - The current Quotation page.
  - The Memo Out and Reserve From Stock flow, which is already approved ([reserve ui-spec](../reserve/ui-spec.md), [memo-out ui-spec](../memo-out/ui-spec.md)).
  - No new design was supplied.
- Backend: [SA revision 2](../../backend/master/quotation/decisions.md#sa-revision-2-2026-11-03--from-stock-approved) and [ADR-0038](../../../adr/0038-quotation-from-stock.md). TODO: [task/todo/quotation.md](../../../task/todo/quotation.md).
- No new package. This revision reuses the shared `MemoStockModal`, the From Stock row mapping in `trade-document/customer-stock.ts`, and the `stockQuantity` row rules of the shared item table and row panel.

## What changes

A quotation can now include stones from stock. **From Stock only copies the item's details into the quotation** (Q-QTS-02):
- Nothing is cut from, held in or reserved in Memo Stock.
- Memo Outstanding doesn't change.
- There is no Approve step. The quotation still saves as it does today, with no status badge.

## From Stock button

- The **From Stock** button next to "Item N rows" is enabled for users who can edit the quotation. It was disabled with "Stock isn't available yet". It stays disabled in view mode.
- Its hint reads "Pick stones from stock (Memo Stock)".
- It opens the shared picker, titled **"Add From Stock"**, which is the same dialog as Reserve and Memo Out:
  - It lists items with something pending, from every vendor, and is not tied to the customer or currency. Items come 50 at a time, with Load more. For now this is Memo Stock only; our own stock joins later (Q-QTS-01).
  - Columns: checkbox, #, Stock ID · Lot ("from {Memo Receive No.} · {vendor}"), Location, Stone · Shape · Size, Color · Clarity / Cutting · Quality, Cer Type · Cer No., Pending Pcs / Weight. It has no price columns.
  - Search reads "Search Stock ID, Lot, Stone, Cer No.". Start → Due filters by the Memo Receive Doc Date.
  - Items already on the quotation are left out (Q-QTS-08).
  - OK adds the checked items. They fill the empty rows first and are appended after that. The toast reads "Added N items from Stock".
- The old mock `FromStockModal` and `mock/stock.ts` are removed.

## Stock rows

These follow the Memo Out revision 2 rules (Q-QTS-03…08):

| Part | Behaviour |
|---|---|
| First column | Stock ID, with a "From stock" lock tag in the row panel |
| Copied, read-only | Lot, Location `Memo`, Stone, Shape, Size, Color, Clarity, Cutting, Quality, Cer Type, Cer No., Price Unit. Stone Code is empty. |
| Pcs / Weight | Start at the full pending. They can be lowered but never raised above the pending they were picked with. Pcs fills Weight in proportion, all pcs gives exactly the pending weight, and the row panel shows "Pending x pcs / y ct". |
| Sale Price | Starts empty and is required (> 0). The vendor's cost is never shown. |
| Discount, Item Note, photos (≤ 5) | Same as typed rows |
| Row menu | No Duplicate. Remove works. |

## Typed rows

These are unchanged (Q-QTS-05):
- Add row stays.
- Clicking an empty row opens the key-in row panel.
- The empty row text stays "Empty row · click to key in, or use From Stock to fill it".

## Errors on Save

- **A stock row is above the item's current pending.** The server checks this only for a row that is new or whose quantity was raised (Q-QTS-03). The row shows "More than pending (x pcs / y ct)", and the toast reads "Row N: More than pending".
- **The item no longer exists** (`QUOTATION_REFERENCE_INVALID` at `lines.N.memoStockId`). The toast reads "Row N: This stock item no longer exists. Remove the row."
- **The same item is on two rows** (`duplicate`). The toast reads "Row N: This stock item is already on the quotation."

## Not in revision 2

- Our own stock in From Stock (inventory).
- Hiding stock-row prices without PRICE (Q-QT-07, Q-QTS-10).
- Converting a quotation into a Reserve, Memo Out or Sale.
- Copying Memo Receive photos.

## Revision 3 — own stock in From Stock (load-to-stock phase 2) — pending-review

- Source: owner 2026-11-18 (verbatim) "2a + 2b เลย", "งั้นทำ ก" (inventory stays the stock owner, Q-LS-36 A), and for the picker "ตามFrom Stock เดิมให้ user ดูที่ location เองว่าเป็น memo หรือ ของจากคลังเรา". Basis: [ADR-0052 D15](../../../adr/0052-load-to-stock-in-backend-api-inventory.md) phase 2a, with the picker changed from two tabs to **one list** by this owner answer (SA must revise D15: [handoff](../../../coordination/handoffs/load-to-stock-p2-sa.md)). No new design source: this revises the implemented picker (`frontend/src/features/trade-document/memo-stock-modal.tsx`); every value below comes from that code or the SA contract, none is estimated. TODO: [load-to-stock Phase 2](../../../task/todo/load-to-stock.md#phase-2--own-stock-in-from-stock).
- This section is the **shared picker behaviour** for Quotation, Reserve and Memo Out; their ui-specs refer here.

### Shared "Add From Stock" picker (one list)

| Part | Behaviour |
|---|---|
| Layout | Unchanged: same dialog, title, columns; no tabs, no source filter. Memo Stock rows and our stock rows appear in **one list**. |
| Telling sources apart | Only the **Location** column: Memo Stock rows show `Memo`; our stock rows show their stored Location name (e.g. `BKK-01`). Ref. shows the Load No. with the existing small `Load` tag and the Load Doc Date (already supported by `RefCell`). |
| Columns for our stock | Stone Code (bold) · Stock ID; no Lot badge (Q-LS-P2-02); vendor code only if the stock keeps one. Location name. Ref. = Load No. `Load` · Doc Date. Stone · Shape · Size, Color · Clarity / Cutting · Quality, Cer Type · Cer No., Item Note as today. **Pcs / Weight = available** (on hand: not reserved, memo-out, sold or consumed). No price column: Stock Price (our cost) is never shown, as Memo Stock cost is not. |
| Search / filters | Same box "Search Stock ID, Lot, Stone, Cer No." and Start → Due; for our stock Start → Due filters the Load Doc Date. Both sources get the same `q`, `from`, `to`. |
| Order and paging | Merged in the browser by Ref. Doc Date desc, then Stock ID desc (Q-LS-P2-01). Each source pages 50 by its own keyset; the list shows merged rows only up to the oldest key both sources have reached, so loaded rows never reorder. **Load more** shows while either source has more and fetches the next page of the source(s) that ran out. |
| Already on the document | Left out, matched by source + id (Memo Stock id vs stock UUID). |
| Available 0 | Our stock rows with 0 available pcs are not listed. |
| One source down | The other source's rows stay listed and pickable. A notice row above the rows: "Our stock is unavailable — Retry" (or "Memo Stock is unavailable — Retry"). Both down: the current error text. Empty list with a source down shows the notice, not the empty text. |
| No permission | A 403 from inventory behaves like "source down" with "You can't view our stock" (no Retry). |
| OK | Unchanged: ticks from both sources are added together; toast "Added N items from Stock". Each line keeps its source (`STOCK` / `OWN_STOCK`). |

### Our-stock rows on the document (Quotation, Reserve, Memo Out)

- As Memo Stock rows: Stock ID first, "From stock" lock tag, copied fields read-only, no Duplicate, Remove works. Pcs / Weight start at the full **available** and can be lowered, never raised above what was picked; the row panel shows "Available x pcs / y ct" (Memo rows keep "Pending x pcs / y ct").
- Location shows the stock's Location name instead of `Memo`. Stone Code and Price Unit copied. Sale Price starts empty and is required, as today (Q-LS-P2-03).
- Read-only after save / approval: the row shows the snapshot saved on the line (Stock ID, Location name, stone fields); view mode never refetches availability.

### Quotation specifics (phase 2a)

- Copy only, nothing held (ADR-0038). Save re-checks our-stock rows that are new or raised against inventory availability, as Memo rows.
- Errors on Save: above available → cell "More than available (x pcs / y ct)", toast "Row N: More than available". Stock gone → "Row N: This stock item no longer exists. Remove the row." `INVENTORY_UNAVAILABLE` → toast "Our stock can't be checked right now; try again"; nothing saved, edits kept. Memo-only quotations save as today.
- From Stock hint becomes "Pick stones from stock (Memo Stock and our stock)".
