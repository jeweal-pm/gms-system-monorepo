# SA decisions: purchase-outstanding, SA revision 1

- Feature / source UI: `purchase-outstanding` / [UI revision 1](../../../frontend/purchase-outstanding/ui-spec.md)
- Status: **approved** 2026-11-06 — owner instruction quoted in the ui-spec (design + formula, "ทำหน้า purchase outstanding มา").
- ADR: [ADR-0044](../../../../adr/0044-purchase-outstanding-report.md) (Accepted). TODO: [task/todo/purchase-outstanding.md](../../../../task/todo/purchase-outstanding.md).
- Service `backend-api-master`, schema `partner`. Read-only; no migration, table, index, container or package.

| ID | Decision |
|---|---|
| SA-POS-01 | **Source:** approved `memo_receive` joined to its `memo_stock` items, the same base as Memo Outstanding › From Vendor (SA-MOV-04). |
| SA-POS-02 | **Buckets per item:** memo = `received`; return = `returned`; purchase = `purchased`; sale = `sold − purchased`; balance = `received − returned − purchased` (pcs and weight each). The document row sums its items. |
| SA-POS-03 | **Listed:** a document with any item whose balance pcs or weight is > 0. |
| SA-POS-04 | **Balance value:** `round(line_amount × balance basis ÷ received basis, 2)` (weight for PER_CT, pcs for PER_PCS; a zero received basis uses `net_unit_price × balance`). Grand total = Σ value × rate (1 for the company currency, else `COALESCE(exchange_rate, 1)`), 2 dp. KPIs Documents / Overdue / Due in 7 days with today in Asia/Bangkok, as SA-MOV-07. |
| SA-POS-05 | **Procedures** (router `purchaseOutstanding`, all `purchase-outstanding:VIEW`): `summary(filters)`, `list(filters + page, pageSize ≤ 50, sort, dir)`, `items({memoReceiveIds: 1–25})`, `options()` (vendors with approved Memo Receives, ≤ 1,000). Filters as From Vendor: `q` (doc no / vendor, escaped ILIKE, ≤ 100), `vendorIds` (≤ 50), `from`/`to` (Memo Receive Doc Date, ≤ 366 days). Sort whitelist: docNo, dueDate (default), vendorName, memoPcs, returnPcs, purchasePcs, salePcs, balancePcs, openValue. |
| SA-POS-06 | **Output:** rows and items as From Vendor with `memo`, `return`, `purchase`, `sale`, `balance` `{pcs, weightCt}` and `openValue` (the balance value); items also give `netUnitPrice` and `priceUnit`. |
| SA-POS-07 | **Permissions:** `MasterMenu` gains `purchase-outstanding` (catalog leaf exists, ADR-0020). No auth change. |

Capacity: the From Vendor query shape (1 query for summary, 2 for a list page, 1 for items, 1 for options), bounded pages and id lists; no new index.
