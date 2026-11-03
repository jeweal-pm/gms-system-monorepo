# SA decisions: memo-outstanding-customer, SA revision 1 (2026-11-03) — **approved**

- Feature: `memo-outstanding-customer` UI revision 1 ([ui-spec](../../../frontend/memo-outstanding-customer/ui-spec.md), [open questions](../../../frontend/memo-outstanding-customer/open-questions.md))
- Status: **approved** 2026-11-03 (owner: "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย")
- ADR: [ADR-0039](../../../../adr/0039-memo-outstanding-customer-report.md). Contract: [api-contract.md](api-contract.md). Diagrams: [sequence](sequence-diagram.md), [database](database-diagram.md), [main flow](../../../../diagram/memo-outstanding-customer-flow.md). TODO: [memo-outstanding-customer.md](../../../../task/todo/memo-outstanding-customer.md).
- Service: `backend-api-master`, schema `partner`. It reads `memo_out` and `memo_out_line`. No migration, service, container, route or package.

| ID | Decision |
|---|---|
| SA-MOC-01 | **Read-only procedures on the existing `memoOutstanding` router:** `customerSummary`, `customerList`, `customerItems` and `customerOptions`, mirroring SA-MOV-01. Nothing is written. |
| SA-MOC-02 | **Buckets per From Stock line** (`memo_out_line.memo_stock_id IS NOT NULL`):<br>• Memo = `pcs` / `weight_ct`<br>• Return = `returned_pcs` / `returned_weight_ct`<br>• Sold = 0 (no column until Sale)<br>• Outstanding = Memo − Return − Sold<br>Document rows sum their lines. Lines typed by hand are left out (Q-MOC-01). |
| SA-MOC-03 | **Rows listed:** `memo_out.status = 'APPROVED'` with at least one stock line still out (`returned_pcs < pcs OR returned_weight_ct < weight_ct`, the `memo_out_line_open_idx` predicate). Filters:<br>• `q`: escaped ILIKE on doc no or customer name snapshot, ≤ 100<br>• `customerIds`: ≤ 50 uuids<br>• `from` / `to`: doc date, ≤ 366 days, from ≤ to |
| SA-MOC-04 | **Paging and sort:** `customerList` uses offset paging (`page ≥ 1`, `pageSize ∈ {10, 25, 50}`) plus `total`. The sort whitelist is `docNo`, `dueDate` (default asc, then docNo), `customerName`, `memoPcs`, `returnPcs`, `soldPcs`, `outstandingPcs` and `openValue`; `dir` is asc or desc, with id as the tie-break. One grouped query plus a count. |
| SA-MOC-05 | **Money:**<br>• Item price = `amount ÷ basis` (basis = weight for PER_CT, pcs for PER_PCS), returned with 4 dp and shown with 2 (Q-MOC-04).<br>• Open value = `round(amount × outstanding_basis ÷ basis, 2)`, in the document currency. A zero basis uses the unit price × outstanding quantity.<br>• A document sums its lines. |
| SA-MOC-06 | **`customerSummary`:** documents, overdue (`due_date < today`), due in 7 days (`today ≤ due ≤ today + 7`) and the grand total (Σ open value × rate, where rate is 1 in the company currency and otherwise `exchange_rate`), with today in Asia/Bangkok. One aggregate query, with the same filters as the list. |
| SA-MOC-07 | **`customerItems {memoOutIds 1–25}`:** the stock lines of those listed documents (approved, still open), ordered by doc no and then line position. At most 25 × 200 rows, in one query. The Stock ID and Lot come from the line. Location is `Memo`. `photoCount` is 0, because Memo Out lines have no photos. |
| SA-MOC-08 | **`customerOptions`:** the distinct customers with approved Memo Out documents (id, code, name), ≤ 1,000, ordered by name. The page needs no `customer:VIEW`. |
| SA-MOC-09 | **Grants:** every procedure needs `memo-outstanding-customer:VIEW` (the existing catalog leaf). `MasterMenu` gains `memo-outstanding-customer`. PRINT and EXCEL are frontend-only, and Excel is unavailable. Prices go to every VIEW holder (Q-MOC-07). |
| SA-MOC-10 | **Code:** `MemoOutstandingService` gains the customer methods with their own SQL fragments, sharing `bangkokToday`, the date-range rule and the error mapping. Input schemas live beside the vendor ones in `memo-outstanding.schemas.ts`. |
| SA-MOC-11 | **Not in this revision:** a Sold writer (Sale), Excel, and a PRICE gate. |

Capacity: each read is one grouped query (plus a count for the list) over `memo_out` ⋈ `memo_out_line`, bounded by the page size. Items are ≤ 5,000 rows per call and options ≤ 1,000. Pool and container limits are unchanged.
