# UI spec: memo-outstanding-customer (Memo › Memo Outstanding › From Customer), revision 1

- Status: **approved** 2026-11-03 (owner: "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย")
- Source: no new design. The page reuses the approved From Vendor page ([its ui-spec](../memo-outstanding-vendor/ui-spec.md) and design sources) with the differences listed here.
- Questions: [open-questions.md](open-questions.md) (Q-MOC-01…10). Flow: [memo-outstanding-customer-flow](../../../diagram/memo-outstanding-customer-flow.md). SA: [decisions](../../backend/master/memo-outstanding-customer/decisions.md), [ADR-0039](../../../adr/0039-memo-outstanding-customer-report.md). TODO: [memo-outstanding-customer.md](../../../task/todo/memo-outstanding-customer.md).

## Purpose

This page is read-only. For each approved Memo Out and each of its stones, it shows:
- how much **we lent** the customer (Memo);
- how much **came back** (Return, from approved Memo Out Returns);
- how much was **sold** (Sold, which reads 0 until Sale exists);
- how much is **still out** (Outstanding).

## Route and access

- The route is `/memo/memo-outstanding/customer`. The sidebar item "Memo Outstanding › Customer" (nav id `memo-outstanding-from-customer`) opens it.
- The breadcrumb reads Home › Memo › From Customer, and the title is **"From Customer"**.
- Access uses the leaf `memo-outstanding-customer`:
  - VIEW opens the page;
  - PRINT enables Print;
  - EXCEL shows the unavailable Excel button.
- Without VIEW the page reads "You don't have permission to view memo outstanding from customers."

## Same as From Vendor

The page reuses the From Vendor components as they are:
- the KPI cards (Documents, Overdue, Due in 7 days, Grand total ({company currency}));
- the filter bar, the selection bar and Show selected rows only;
- Show subtasks, Customize view and the resizable columns (Refresh resets them);
- the pager, Print, and the loading, empty and error states.

## Differences

| Part | From Customer |
|---|---|
| Documents | Approved Memo Outs with stones still out (Q-MOC-01). The Doc Number links to `/memo/memo-out/{id}`. |
| Party | The **Customer** column (Customer Name), a **Customer** multi-select filter, and the search placeholder "Search Doc No. / Customer" |
| Number groups | **Memo · Return · Sold · Outstanding**, with no Reserve (Q-MOC-02). Sorting works on each group's Pcs, Customer Name, Doc Number, Due Date and Price. |
| PRICE / UNIT | Document row: the open value with the caption "open value (outstanding)". Item row: the Sale Price after the line discount, 2 dp, per cts / per pcs (Q-MOC-04). |
| Customize view | Same list without Reserve. The locked columns are Doc Number, Customer Name, Doc Date, Due Date and Overdue. |
| Empty | "No memo items outstanding at customers." With filters set: "No documents match these filters." |
| Print title | "Memo Outstanding — From Customer" |
| Kept per browser | Its own storage keys, separate from From Vendor |

## Out of scope (revision 1)

- Excel export.
- Real Sold figures (they come with Sale).
- Editing anything.
