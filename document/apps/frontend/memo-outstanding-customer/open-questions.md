# Open questions: memo-outstanding-customer (UI revision 1 / SA revision 1)

Approved with revision 1 by the owner's instruction on 2026-11-03: "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย". The answers below are the defaults that instruction accepted. Name an ID to change one later.

| ID | Question | Answer (default) |
|---|---|---|
| Q-MOC-01 | Which documents are listed? | **Approved** Memo Out documents with at least one From Stock line still out (pcs or weight above what came back). Fully returned documents and pending-approval documents are hidden. Lines typed by hand before memo-out rev 3 are left out, because they can't be returned. |
| Q-MOC-02 | Which columns? | **Memo · Return · Sold · Outstanding**, each with Pcs and Weight. Memo = lent on the Memo Out, Return = brought back by approved Memo Out Returns, Sold = 0 until Sale exists, Outstanding = Memo − Return − Sold. There is no Reserve column, because stones with a customer can't be reserved. The document row is the sum of its lines. |
| Q-MOC-03 | What does Start → Due filter? | The Memo Out **Doc Date** from–to (≤ 366 days), as on From Vendor. |
| Q-MOC-04 | Which price is shown? | **PRICE / UNIT** on item rows is the Sale Price after the line discount (line amount ÷ weight or pcs), 2 dp, with "per cts" or "per pcs". The document row shows the **open value** = the sale value of what is still out, with the caption "open value (outstanding)". |
| Q-MOC-05 | Grand total currency | Each open value is converted with the document's exchange rate into the **company currency**, as Q-MOV-05. |
| Q-MOC-06 | Item identity | **Stock ID · Lot** (from Memo Stock), Location `Memo`, stone, color · clarity, certificate and item note, as on From Vendor. |
| Q-MOC-07 | Who sees prices? | Every user with VIEW, as Q-MOV-07. |
| Q-MOC-08 | Excel | Not in this revision; the button is shown unavailable. Print works with PRINT. |
| Q-MOC-09 | Title, route, access | The title is "From Customer" (breadcrumb Home › Memo › From Customer). The route is `/memo/memo-outstanding/customer`, and access needs the catalog leaf `memo-outstanding-customer` (VIEW / PRINT / EXCEL). |
| Q-MOC-10 | Show subtasks, Customize view, selection, column widths | As on From Vendor. They are kept per browser separately for each page, and Refresh resets the column widths. |
