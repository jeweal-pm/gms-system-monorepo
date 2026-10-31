# SA decisions: memo-out + memo-out-return, SA revision 1 (2026-10-28)

- Features: `memo-out` (UI rev 1, [ui-spec](../../../frontend/memo-out/ui-spec.md)) and `memo-out-return` (UI rev 2, [ui-spec](../../../frontend/memo-out-return/ui-spec.md))
- Status: **implemented**.
  - Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย" (direct instruction).
  - Party answer the same day: "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor".
  - Other open questions use the defaults in each feature's open-questions file.
- ADR: [ADR-0033](../../../../adr/0033-memo-documents-in-master-service.md). Contract: [api-contract.md](api-contract.md).
- Service: `backend-api-master`, schema `partner`. No new service, container, volume, nginx route or package.

| ID | Decision |
|---|---|
| SA-MO-01 | Tables `memo_out`, `memo_out_line`, `memo_out_charge`, `memo_out_return`, `memo_out_return_line`, `memo_out_return_charge`, migration `20261028090000_memo_out`. Shaped like the quotation tables, without photo, reason or approval columns. CHECKs: status DRAFT, due ≥ doc date, rates, line values. |
| SA-MO-02 | Permissions: existing leaves `memo-out` / `memo-out-return`. VIEW = list/get/nextNumber/options; ADD = create; EDIT = update; DELETE = delete. `MasterMenu` gains both; `currency.options` is readable with either. |
| SA-MO-03 | Status DRAFT only (no approval, Q-MO-01/Q-MOR-07). Update and delete need a draft, else `<CODE>_STATUS_INVALID` (409). |
| SA-MO-04 | Numbers from Document Setup keys `memo-out` / `memo-out-return`: the row in effect on the doc date is locked; next number = max running no for that row + 1 (or start no); no row → plain 1, 2, 3 … under an advisory lock per document type. `nextNumber` previews it. Document Setup `used` = referenced by a quotation, memo out or memo out return. |
| SA-MO-05 | Party: Memo Out = active customer (or the stored one) with a SHIPPING and an INVOICE address of that customer. Memo Out Return = active vendor (or the stored one) with one of its addresses. Snapshots store code, name and formatted address text. |
| SA-MO-06 | Header, lines and totals as quotation (SA-QT-06/07/08): currency active or stored; exchange rate required for a foreign currency; ≤ 200 MANUAL lines; server-computed totals. Lines may not carry photos (`photoIds` max 0). |
| SA-MO-07 | Optimistic `version`; mismatch → `<CODE>_CHANGED` (409); missing → `<CODE>_NOT_FOUND` (404); bad party/address/currency/stone code → `<CODE>_REFERENCE_INVALID` (422, field named). `<CODE>` = `MEMO_OUT` or `MEMO_OUT_RETURN`. |
| SA-MO-08 | One shared engine (`src/trade-document/document-engine.ts`) with a party adapter per document (`memo-out.service.ts`, `memo-out-return.service.ts`). Log events `memo_out.*` / `memo_out_return.*` (ids and doc no only). |
| SA-MO-09 | Lists: keyset `(doc_date desc, created_at desc, id desc)`, ≤ 50, search doc no / party name / ref, optional `partyId`, date range. Options: `memoOut.options` has the `quotation.options` shape (customers, currencies, company currency, charge types, numbering, stone lists); `memoOutReturn.options` lists vendors with addresses instead of customers. |
| SA-MO-10 | Not in revision 1: stock posting (inventory, ADR-0027), line photos, From Stock, Memo Outstanding source for returns. |

## SA revision 2 (2026-10-31): Memo Out cuts Memo Stock through From Stock — **approved** (owner 2026-10-31: "อนุมัติ memo-out revision 2")

- Feature: `memo-out` UI revision 2 ([ui-spec](../../../frontend/memo-out/ui-spec.md)). `memo-out-return` is unchanged.
- Owner request 2026-10-31 (verbatim): "sa frontend backend Memo Out คือการตัดของจาก from stock โดยของจาก from stock จะมาจาก memoin และเมื่อทำ flow ของ Memo Out เสร็จของจะถูกตัดจริงๆ".
- Owner answers the same day (Q-MO-09…12 in [open questions](../../../frontend/memo-out/open-questions.md)):
  - Q-MO-09 "สามารถตัดของจาก from stock และถ้า add row manual ไม่ต้องตัดอะไรจากไหนเลย" (both kinds of row).
  - Q-MO-10 part or all of an item.
  - Q-MO-11 Sale Price typed by the user.
  - Q-MO-12 Memo Out Return later.
- It builds on earlier owner answers:
  - Q-MR-11/14: From Stock = our stock + Memo Stock, Memo Stock only until inventory exists.
  - Q-MR-15: stock is cut at approval of the document, not on save, with the over-pull guard.
  - Q-MOV-04: Reserve = Memo Out approved.
- ADR: [ADR-0033 revision 2](../../../../adr/0033-memo-documents-in-master-service.md) (Proposed). Contract: [api-contract.md](api-contract.md). Diagrams: [database](database-diagram.md), [sequence](sequence-diagram.md), [main flow](../../../../diagram/memo-out-flow.md). TODO: [memo-out.md](../../../../task/todo/memo-out.md) revision 2.
- Service: `backend-api-master`, schema `partner`. No new service, container, volume, nginx route, cache or package ([tech-stack](../../../../adr/tech-stack.md) unchanged).

| ID | Decision |
|---|---|
| SA-MO-11 | **Status.** Memo Out: `PENDING_APPROVAL` → `APPROVED` only, the memo receive / memo return engine config (`createStatus`, `editableStatuses`). Save creates PENDING_APPROVAL. Update and delete need PENDING_APPROVAL, else `MEMO_OUT_STATUS_INVALID` (409). `memoOut.approve {id, expectedVersion}` needs `memo-out:APPROVE` + CSRF; after it the document is read-only. No reject / unapprove in this revision. `approved_at` / `approved_by` columns as memo return. Memo Out Return keeps DRAFT (SA-MO-03 unchanged for it). |
| SA-MO-12 | **Two kinds of line (Q-MO-09).** A line with `memoStockId` is a **stock line** (`source = STOCK`): it names a Memo Stock item, and approval cuts it. A line without one is a **manual line** (`source = MANUAL`), typed as today, and cuts nothing. New nullable columns on `memo_out_line`: `memo_stock_id` (FK → `memo_stock`, ON DELETE RESTRICT, indexed), `stock_id` (snapshot), `stock_pending_pcs` / `stock_pending_weight_ct` (the item's pending at save, shown as the row's maximum; CHECK pcs ≤ it). These are NULL on manual lines. |
| SA-MO-13 | **Saving a stock line** (engine `prepare` hook, inside the save transaction, no lock, reserves nothing):<br>• The item must exist (else `MEMO_OUT_REFERENCE_INVALID` `lines.N.memoStockId`). It may be of any vendor and currency, because Memo Out sells to a customer at its own price.<br>• The same item may appear only once per document (`VALIDATION_ERROR` `duplicate`).<br>• Pcs and weight must be ≤ the item's pending (`exceeds_pending`), and pcs or weight must be > 0 (Q-MO-10).<br>• The server copies Stock ID, lot, location `Memo`, stone attributes and certificate from the item. Stone code stays empty: Memo Stock has none (memo-receive rev 2). Price unit comes from the item.<br>• Sale Price, discount and item note are the user's (Q-MO-11). The price is required: unit price > 0 for a stock line, else `VALIDATION_ERROR` `lines.N.unitPrice required`. |
| SA-MO-14 | **Approve cuts stock** (one `WRITE_TX`, as memo return approve):<br>1. A guarded `UPDATE memo_out … WHERE id AND version AND status = PENDING_APPROVAL`. 0 rows → re-read for NOT_FOUND / STATUS_INVALID / CHANGED.<br>2. Lock the items of its stock lines `FOR UPDATE` in id order (no deadlock between concurrent approvals).<br>3. Over-pull guard: a line asking more than the item's current pending → `MEMO_OUT_PENDING_SHORT` (409) with the short line fields, and nothing changes.<br>4. Otherwise one `UPDATE memo_stock` moves each line's pcs / weight from pending into **Reserve** (`pending -= q, reserved += q, version + 1`; Q-MOV-04). The `memo_stock_balance` CHECK keeps pending = received − returned − sold − reserved.<br>Manual lines change nothing. A document with only manual lines approves with no stock change. Log `memo_out.approved` (id, docNo, stock line count). |
| SA-MO-15 | **From Stock list.** `memoStock.list` is also readable with `memo-out:VIEW`. `vendorId` becomes optional, so From Stock lists every vendor's items with pending > 0. A new partial index `memo_stock_pending_all_idx (received_doc_date DESC, stock_id DESC) WHERE pending > 0` serves it. Pages are still ≤ 50 (keyset), and search and date filters are unchanged. Memo Return keeps sending its vendor and currency. Our own stock joins this list when the inventory service exists (ADR-0027). |
| SA-MO-16 | **Existing data.** The migration widens the status CHECK to PENDING_APPROVAL / APPROVED and turns existing DRAFT memo outs into PENDING_APPROVAL. Their lines are manual, so approving them cuts nothing. Rollback: allowed while no memo out is APPROVED; it restores DRAFT and drops the new columns and index. |
| SA-MO-17 | **Not in this revision:** Memo Out Return putting Reserve back (Q-MO-12, a later revision with Q-MOR-10), Sale, our own stock (inventory), line photos on Memo Out, and Approve from a separate Approve page. |

Capacity: approval locks ≤ 200 `memo_stock` rows and runs 1 status update, 1 lock query and 1 batch update in one transaction. The From Stock list is 1 query, ≤ 51 rows, on a partial index. Expected data is thousands of items a year, so the pool and container limits of ADR-0027 are unchanged.
