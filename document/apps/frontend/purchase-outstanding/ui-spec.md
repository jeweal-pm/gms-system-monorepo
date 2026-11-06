# UI specification: purchase-outstanding revision 1

- Feature ID / revision: `purchase-outstanding` / 1
- Status: **approved** 2026-11-06 — owner instruction with the design and the formula (verbatim): "ทำหน้า purchase outstanding มาโดยสูตรbalance คือ memo - return - purchase ส่วน sale คือ รอย้ายมา purchase (1) ไม่ต้องสนใจ เป็น 1 ธรรมาดา"
- Source: [source/01-purchase-outstanding.png](source/01-purchase-outstanding.png) (desktop, one document expanded).
- Backend: [SA revision 1](../../backend/master/purchase-outstanding/decisions.md), [ADR-0044](../../../adr/0044-purchase-outstanding-report.md). TODO: [task/todo/purchase-outstanding.md](../../../task/todo/purchase-outstanding.md). Defaults: [open-questions.md](open-questions.md).
- No new package. The page is the shared Memo Outstanding report (From Vendor / From Customer, ADR-0035/0039) with its own columns, labels, URL, storage key and data hooks.

## Route and menu

- Route `/purchase-order/purchase-outstanding`; sidebar **Purchase Order › Purchase Outstanding** (slug `purchase-outstanding`) stops being a placeholder. Breadcrumb Home › Purchase Order › Purchase Outstanding.
- Access: the existing permission leaf `purchase-outstanding` (VIEW to see; PRINT / EXCEL as on the other reports).

## What it lists

One row per **approved Memo Receive** (Doc Number = Memo Receive No.) that still has a **Balance Outstanding** above 0 on any item; expanding a row shows its Memo Stock items. Rows link to the Memo Receive.

## Columns and formulas (per item; the document row is the sum of its items)

| Column | Pcs / Weight |
|---|---|
| **Memo** | received |
| **Return** | returned to the vendor (Memo Return) |
| **Purchase** | bought by approved Purchases (`purchased`) |
| **Sale** | sold to customers and **waiting to move to Purchase** = sold − purchased. Shown as a plain number (owner: "(1) ไม่ต้องสนใจ เป็น 1 ธรรมาดา" — no brackets). |
| **Balance Outstanding** (subtitle "= Memo − Return − PU") | **Memo − Return − Purchase**. It still includes the Sale quantity, because a sold stone is owed to the vendor until it is purchased. |

- Under the document's Balance: "{weight} ct · {value} {currency}", where value = line amount × balance basis ÷ received basis (weight for per-ct, pcs for per-pcs), 2 dp, summed over the items.
- Under an item's Balance: "{weight} ct · {net unit price} {currency}/cts" (or "/pcs").
- Doc Number / Doc Date, Due Date with "Nd overdue" / "Due in Nd", Vendor Name, the item details (stone, shape · size, color · clarity · cutting · quality, certificate, note): as on From Vendor.

## Header and tools

- KPI cards: **Documents**, **Overdue** (due date before today, Bangkok), **Due in 7 days**, **Grand total ({company currency})** = Σ balance value × rate (1 for the company currency, else the document's exchange rate).
- Search "Search Doc No. / Vendor", **Vendor** filter, **Start → Due** (Memo Receive Doc Date range), column settings, print, Excel, refresh, sort on every column, pages of 10 / 25 / 50 — all as on From Vendor.

## Not in revision 1

- Purchase documents as rows (a PO-based outstanding view).
- Sale invoice details under Sale (no Sale page yet).
