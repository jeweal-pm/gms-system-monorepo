# SA decisions: memo-return, SA revision 2 (as built, recorded 2026-10-30)

- Feature: `memo-return` (UI rev 1, [ui-spec](../../../frontend/memo-return/ui-spec.md)). Contract: [api-contract.md](api-contract.md). Diagrams: [flow](../../../../diagram/memo-return-flow.md), [sequence](sequence-diagram.md), [database](database-diagram.md).
- Status: **implemented**. Built in PR #59 (`feat/29-10-26-memo-return`). Merged into `feat/30-10-26-memo-outstanding-vendor` on 2026-10-30 with the Return-bucket fix (SA-MRT-07).
- Owner requests:
  - 2026-10-29: "uxui ช่วยเขียน spec memo return ให้หน่อยและ frontend backend ช่วยเขียน UI และ api ให้หน่อย Memo Return No.: ดึงค่ามาจาก Document set up ด้วย".
  - Q-MR-15: pending is reduced when Memo Out, Sale or Memo Return is approved, never by Quotation.
- Builds on:
  - [ADR-0033](../../../../adr/0033-memo-documents-in-master-service.md): memo documents in `backend-api-master`, shared `TradeDocumentEngine`.
  - [ADR-0034](../../../../adr/0034-memo-receive-approval-and-memo-stock.md): Memo Stock.
  - [ADR-0035](../../../../adr/0035-memo-outstanding-vendor-report.md): bucket columns.
- Service: `backend-api-master`, schema `partner`. No new service, container, volume, nginx route or package.
- This document records the code as built. It is not a new design and needs no separate approval.

| ID | Decision |
|---|---|
| SA-MRT-01 | Migration `20261029160000_memo_return` adds `memo_return`, `memo_return_line` and `memo_return_charge`, with the same header, charge and CHECK columns as memo out return. `memo_return_line` holds `memo_stock_id` (FK → `memo_stock`, ON DELETE RESTRICT, indexed, `UNIQUE (memo_return_id, memo_stock_id)`), a `stock_id` copy and `outstanding_pcs` / `outstanding_weight_ct`, with CHECK pcs ≤ outstanding_pcs and weight ≤ outstanding_weight. Rollback is only possible before any memo return is approved. |
| SA-MRT-02 | Permissions: leaf `memo-return` VIEW / ADD / EDIT / DELETE / APPROVE. `memoStock.list` accepts `memo-return:VIEW` or `memo-receive:VIEW`. Mutations need the CSRF header. |
| SA-MRT-03 | Numbers come from Document Setup key `memo-return` (prefix MRT), with the same rules as SA-MO-04. |
| SA-MRT-04 | Party: vendor and one of its addresses, through the shared `vendorParty` adapter (also used by memo out return). No photos. |
| SA-MRT-05 | **Memo Stock source**: `memoStock.list` returns the vendor's items (optionally of one currency) with `pending_pcs > 0 OR pending_weight_ct > 0`. It runs one keyset query (receive doc date, stock id) of up to 50 rows plus one, with no count, filtered by receive date range (≤ 366 days) and search. Amount is the line amount pro-rata to pending. |
| SA-MRT-06 | **Save** (engine `prepare` = `completeReturnLines`): each line must name an item of the document's vendor and currency, else `MEMO_RETURN_REFERENCE_INVALID`; an item listed twice gives `VALIDATION_ERROR duplicate`. Item fields are copied, the unit price is the item's net unit price after discount (Q-MR-13, 2 dp) and the line discount is NONE. Outstanding is the item's pending now, and a Return above it gives `exceeds_outstanding`. Status is `PENDING_APPROVAL`. **Saving reserves nothing**: Memo Stock is not changed and rows are not locked. |
| SA-MRT-07 | **Approve**: a guarded UPDATE (`id`, `version`, `status = PENDING_APPROVAL`) sets APPROVED, `approved_at` and `approved_by`. The items are then locked `FOR UPDATE` in id order and every line is re-checked against pending, else `MEMO_RETURN_PENDING_SHORT` (409) and the whole transaction rolls back. One UPDATE then moves the quantity: `pending_* −= return`, `returned_* += return`, version + 1. This keeps CHECK `memo_stock_balance` (SA-MOV-02) true and feeds the Return column of Memo Outstanding. The `returned_*` part was added at the merge on 2026-10-30, and IT-MRT-03 checks it. |
| SA-MRT-08 | Edit and delete are allowed only while `PENDING_APPROVAL` (engine `editableStatuses`). An approved return can't be reversed in this revision. |
| SA-MRT-09 | Not in this revision: reversing an approved return, the central Approve page, Excel export. Sold and Reserve buckets are written by later documents (Q-MOV-04). |

## Revision 1 (superseded)

SA revision 1 (2026-10-29) linked return lines to memo receive lines (`source_line_id`). It computed pending as the line quantity minus the other returns, kept documents as `DRAFT` only, and exposed `memoReturn.memoStock` (≤ 200 rows). It was replaced before release once Memo Receive gained approval and Memo Stock (ADR-0034). Its IDs SA-MR-01…08 clash with the memo-receive SA IDs, so revision 2 uses the SA-MRT prefix.
