# ADR-0039: Memo Outstanding › From Customer report (what each approved Memo Out lent, got back and still has out)

- Status: **Accepted** (2026-11-03)
- Date: 2026-11-03
- Feature / source UI revision: `memo-outstanding-customer` / 1
- SA revision: 1 ([decisions](../apps/backend/master/memo-outstanding-customer/decisions.md), [API contract](../apps/backend/master/memo-outstanding-customer/api-contract.md))
- Deciders: project owner
- Approval evidence: owner 2026-11-03: "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย". The owner asked for the documents and the start of the work together, so this instruction approves revision 1 as written, including the Q-MOC defaults.
- Related:
  - [ADR-0035](0035-memo-outstanding-vendor-report.md) (the From Vendor report this page mirrors)
  - [ADR-0033](0033-memo-documents-in-master-service.md) revisions 2–3 (Memo Out From Stock; Memo Out Return brings stones back)
  - [ADR-0036](0036-reserve-document.md)

## Context

The sidebar has Memo › Memo Outstanding › Customer, and the catalog leaf `memo-outstanding-customer` (Customer) exists. The page itself does not exist yet.

The From Vendor page (ADR-0035) answers "what did each vendor lend us, where did it go, what is left". The Customer page answers the same question for the other direction: **what did we lend each customer on an approved Memo Out, what has come back (Memo Out Return), and what is still out**.

The data already exists:
- `memo_out_line` holds the lent quantity (pcs / weight), the sale value (amount after the line discount) and, since memo-out-return revision 4, `returned_pcs` / `returned_weight_ct`, which approved Memo Out Returns fill.
- `memo_out_line_open_idx` already indexes the open From Stock lines.

No design was supplied, so the page reuses the From Vendor layout.

## Decision

1. **Read-only procedures on the existing `memoOutstanding` router:** `customerSummary`, `customerList`, `customerItems` and `customerOptions`, mirroring the vendor ones. Nothing is written. There is no migration.
2. **Rows:**
   - Approved Memo Out documents with at least one **From Stock line still out**, where pcs − returned_pcs > 0 or weight − returned_weight > 0.
   - Lines typed by hand before memo-out revision 3 are left out. They can't be returned, so they would never close.
3. **Buckets per line: Memo (lent) = Return + Sold + Outstanding.**
   - Return = `returned_*`.
   - Sold reads 0 until the Sale document exists.
   - Outstanding = Memo − Return − Sold.
   - Reserve does not apply to stones that are with a customer, so the page has no Reserve column.
   - A document row is the sum of its lines.
4. **Money:**
   - Price per unit = line amount ÷ basis (weight for per-ct, pcs for per-pcs). This is the Sale Price after the line discount, shown with 2 decimals.
   - Open value = amount × outstanding basis ÷ basis, in the document currency.
   - The grand total converts each open value with the document's exchange rate into the company currency, as in ADR-0035.
5. **Grants:** every procedure needs `memo-outstanding-customer:VIEW`. PRINT gates Print, and Excel is unavailable, as on the Vendor page. `MasterMenu` gains `memo-outstanding-customer`.
6. **Frontend: one report component set for both pages.** The From Vendor table, filters, KPIs, Customize view, column resize, selection and print take a report configuration covering labels, routes, buckets, sort keys, data hooks and the browser storage key. From Vendor keeps its exact behaviour.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Copy the From Vendor feature folder | It would duplicate about 1,500 lines of table, filter and print code, and every later fix would have to be made twice. |
| Bucket counters on `memo_out_line` like `memo_stock` (sold / reserved) | Only Return exists today, and `returned_*` is already stored. Sold gets a column when Sale is designed. |
| Include lines typed by hand | They can never be returned (Memo Out Return picks From Stock lines only), so they would stay outstanding forever. |

## Consequences and capacity

- There is no schema change, rollback is just removing the code, and there is no new process, cache, route or package.
- Bounds are the same as the Vendor report:
  - Page sizes are 10, 25 or 50.
  - Items are read for at most 25 documents per call, at most 200 lines each.
  - Options return at most 1,000 customers.
  - Each read is one grouped query plus one count.
- This fits the 4 GB / 2 vCPU host.
- Once Sale exists, it fills Sold for both reports.

## Acceptance

- The page lists approved Memo Outs that still have stones out, with the KPIs (Documents, Overdue, Due in 7 days, Grand total) for the current filters.
- After a Memo Out Return is approved, its Return grows and Outstanding drops. A fully returned Memo Out leaves the list.
- From Vendor behaves as before.
- This approval covers:
  - this ADR;
  - [ui-spec](../apps/frontend/memo-outstanding-customer/ui-spec.md), [open questions](../apps/frontend/memo-outstanding-customer/open-questions.md) and [testing](../apps/frontend/memo-outstanding-customer/testing.md);
  - the [SA bundle](../apps/backend/master/memo-outstanding-customer/decisions.md);
  - [main flow](../diagram/memo-outstanding-customer-flow.md);
  - [TODO](../task/todo/memo-outstanding-customer.md).
