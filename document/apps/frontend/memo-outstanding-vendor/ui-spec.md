# UI spec: memo-outstanding-vendor (Memo › Memo Outstanding › From Vendor), revision 1

- Status: **approved** 2026-10-29 (owner: "อนุมัติ memo-outstanding-vendor revision 1")
- Owner request 2026-10-29 (verbatim): "frontend backend สามารถทำตัว memo outstanding from vendor เลยได้ไหมหน้านี้เเค่เเสดงผลตอนนี้เรามี memo receive อธิบายเพิ่มเติม memo เเรกคือ memo receive ว่านำเข้ามาเท่าไหร่เเล้วไปไหนเเล้วมั้งเหลือเท่าไหร่ ออก เอกสาร adr มาก่อนก็ได้"
- Source: 6 owner screenshots, 2026-10-29, about 1407×790 desktop. Values are estimated from pixels, not Figma.
  - [01 list](source/01-list.png)
  - [02 vendor filter](source/02-vendor-filter.png)
  - [03 show subtasks menu](source/03-show-subtasks.png)
  - [04 expanded + selection](source/04-expanded-selected.png)
  - [05 customize view](source/05-customize-view.png)
  - [06 customize panel](source/06-customize-panel.png)
  - [07 item rows, tooltip "Show selected rows only."](source/07-item-rows-show-selected.png)
- Questions: [open-questions.md](open-questions.md). Main flow: [memo-outstanding-vendor-flow](../../../diagram/memo-outstanding-vendor-flow.md). TODO: [memo-outstanding-vendor.md](../../../task/todo/memo-outstanding-vendor.md). SA: [decisions](../../backend/master/memo-outstanding-vendor/decisions.md), [ADR-0035](../../../adr/0035-memo-outstanding-vendor-report.md).
- Marks used below:
  - **D**: seen in the design.
  - **A**: assumption, listed in the open questions.
  - **C**: existing code reused.

## Purpose

This page is read-only. It answers, for each approved Memo Receive and each of its items:
- **how much came in** (Memo)
- **where it went** (Return, Sold, Reserve)
- **how much is still with us** (Outstanding)

Today only Memo Receive exists, so Return, Sold and Reserve read 0 until those documents are built (ADR-0035).

## Route and access

- Route `/memo/memo-outstanding/vendor`. The sidebar item "Memo Outstanding › Vendor" (nav id `memo-outstanding-from-vendor`) opens it, added to `REAL_PAGE_HREFS` (C).
- Breadcrumb Home › Memo › From Vendor. The title is "From Vendor". The design spells it "Vender", which is treated as a typo (Q-MOV-01).
- Gate: catalog leaf `memo-outstanding-vendor`.
  - VIEW is needed to open the page.
  - PRINT enables Print.
  - EXCEL enables the Excel button, which stays unavailable with the tooltip "Excel export isn't available yet", as on other pages (C, Q-MOV-08).

## Layout (D)

| Region | Content |
|---|---|
| Header | Title "From Vendor". Right side: Print, Excel, Refresh. |
| KPI cards (4, equal width, about 290×55) | **Documents**: n doc. **Overdue**: n doc, number in red. **Due in 7 days**: n doc, number in amber. **Grand total ({company currency})**: amount, 2 dp (Q-MOV-05). All four follow the current filters. |
| Filter bar | Search "Search Doc No. / Vendor" (about 260 px). **Vendor** multi-select popover with checkboxes, a "Clear" link and the vendors listed by name (D 02). Date range **Start → Due** (Q-MOV-03). Right side toolbar: Show subtasks (menu), Customize view (columns), Print, Excel, Refresh. |
| Selection bar (replaces the filter bar while items are selected) | "n selected" · **Show selected rows only** toggle (D 07, tooltip on the item checkbox) · Print · Excel · ✕ Clear (D 04). While the toggle is on, the table shows only the selected items under their documents. Clear turns it off. |
| Table | One row per document; expanding it shows its item rows (subtasks). See below. |
| Footer | "Showing a–b out of n items". Page size select 10 / **25** (default) / 50. Pager with numbers, ‹ ›. |

## Table

Document row (D 01). The left part is frozen and the number groups scroll sideways on narrow screens:

| Column | Content |
|---|---|
| ▸ / ▾ | Expand toggle, tooltip "View items in this document" |
| Doc Number / Doc Date | Memo Receive No. (link to `/memo/memo-receive/{id}`, teal), Doc Date `dd/MM/yyyy` |
| Due Date / Overdue | Due date. Below it: red "Nd overdue" when past due, amber "Due in Nd" within 7 days, grey "in Nd" otherwise. Days are counted in Asia/Bangkok. |
| Vendor Name | Truncated with an ellipsis; the full name shows in a tooltip |
| Memo · Return · Sold · Reserve · Outstanding | Each has two sub-columns, **Pcs** (integer) and **Weight** (2 dp shown, 3 dp stored). For every item, Return + Sold + Reserve + Outstanding = Memo (Q-MOV-02); a document row is the sum of its items (Q-MOV-09). |
| PRICE / UNIT | Document row: open value = value of (Reserve + Outstanding) in the document currency, e.g. "13,633.50 USD", with the grey caption "open value (reserve + outstanding)" |

- Sort (D, sort icons): Doc Number, Due Date, Vendor Name, each Pcs group (sorts by pcs), Price. Default is Due Date ascending, then Doc Number (A).
- Item rows (D 04), indented, with a checkbox on each item:
  - **Line 1**: Stone name, in bold.
  - **Line 2**: Shape · Size, Color · Clarity · Cutting · Quality, Cer Type + Cer No.
  - **Line 3**: 💬 item note.
  - **Also shown**: Stock ID and Lot (A, Q-MOV-06: the design has no stock column), and Location `Memo` when the column is on.
  - **Numbers**: the same five pcs/weight groups per item.
  - **PRICE**: net unit price after the line discount (Q-MR-13) + unit, e.g. "1,850.00 USD per cts".
- Show subtasks (D 03): menu "Collapsed (default)" ✓ / "Expanded". Expanded opens every document on the current page. The choice is kept per browser (`localStorage`, try/catch).
- Customize view (D 05/06): right-side panel about 340 px, "Shown in table" and "Hidden in table" lists, each with Hide all / Show all and a switch per column.
  - Locked (always on, greyed): Doc Number, Vendor Name, Doc Date, Due Date, Overdue.
  - Can be switched: **Stock ID · Lot** (in place of the design's Stone Code, Q-MOV-06), Location, Stone, Color · Clarity, CER Type, Remark, Memo, Return, Memo, Return, **Sold**, Reserve, Outstanding, Price, in the column-header order (Q-MOV-04 answered: the panel's "PO/Purchase" is Sold, and Reserve is added).
  - The panel closes with ✕ or Esc, and focus returns to the toolbar button. Choices are kept per browser.

## Behavior and states

- Filters and sort are applied on the server. Search waits 300 ms after typing. Changing a filter goes back to page 1. Refresh reloads the KPIs and the list.
- Expanding a row loads its items once (cached 30 s). Expanded mode loads the items of every document on the current page in one call.
- Printing prints the selected items, or the current page when nothing is selected, through a print-only view with the title, filters, the date printed and the visible columns (C, the same pattern as vendor print). Print is hidden without PRINT.
- **Loading**: skeleton KPIs and 5 skeleton rows.
- **Empty**: "No memo items outstanding from vendors." With filters set: "No documents match these filters." with a Clear filters button.
- **Error**: an inline banner "Couldn't load the outstanding list. Try again." with Retry. PERMISSION_DENIED shows the standard no-access page.
- **Accessibility**: the table has row headers, the expand toggles use `aria-expanded`, checkboxes are labelled with the Stock ID, and the popover and panel are focus-trapped.

## Out of scope (revision 1)

- Excel export (unavailable button).
- Editing anything.
- From Customer (a separate feature).
- Real Return, Sold and Reserve figures, which arrive with Memo Return, Sale and Reserve/Memo Out.

## Dependencies

No new package. The page uses existing components: data table patterns, `IconButton`, popover, sheet/panel, print view, `masterTrpc` and react-query (C). See [tech-stack](../../../adr/tech-stack.md).
