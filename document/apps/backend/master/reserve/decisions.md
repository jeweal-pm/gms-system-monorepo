# SA decisions: reserve, SA revision 1 (2026-11-02) — **approved** (owner 2026-11-02: "อนุมัติ reserve revision 1")

- Feature: `reserve` UI revision 1 ([ui-spec](../../../frontend/reserve/ui-spec.md), [open questions](../../../frontend/reserve/open-questions.md)).
- Owner request 2026-11-02: "uxui ช่วยเขียน spec Reserve โดยฟังชันก์นี้ จะเป็นการจองของเพื่อนำไปทำหน้า sale frontend backend ทำ ui และ api ให้หน่อย". Answers Q-RS-01…04 the same day.
- ADR: [ADR-0036](../../../../adr/0036-reserve-document.md) (Accepted). Contract: [api-contract.md](api-contract.md). Diagrams: [database](database-diagram.md), [sequence](sequence-diagram.md), [main flow](../../../../diagram/reserve-flow.md). TODO: [reserve.md](../../../../task/todo/reserve.md).
- Service: `backend-api-master`, schema `partner`. No new service, container, volume, nginx route, cache or package ([tech-stack](../../../../adr/tech-stack.md) unchanged).
- It reuses, unchanged:
  - the trade-document engine (ADR-0033);
  - the Memo Stock buckets and balance CHECK (ADR-0035);
  - the From Stock rules of [Memo Out SA rev 2](../memo-out/decisions.md) (SA-MO-11…15);
  - the existing catalog leaf `reserve` and Document Setup key `reserve` (code RS).

| ID | Decision |
|---|---|
| SA-RS-01 | **Tables** `reserve`, `reserve_line`, `reserve_charge`, migration `20261102090000_reserve` (additive), shaped like `memo_out` / `memo_out_line` / `memo_out_charge` after Memo Out revision 2:<br>• Customer, shipping and invoice address snapshots; `approved_at` / `approved_by`.<br>• Lines carry the nullable stock columns `memo_stock_id` (FK → memo_stock, RESTRICT, indexed), `stock_id`, `stock_pending_pcs`, `stock_pending_weight_ct`, under the same stock CHECK and the same unique (reserve, item).<br>• Other CHECKs: status PENDING_APPROVAL / APPROVED, approved_at set exactly when APPROVED, due ≥ doc date, line values. |
| SA-RS-02 | **Permissions:** existing leaf `reserve`. VIEW = list / get / nextNumber / options; ADD = create; EDIT = update; DELETE = delete; APPROVE = approve (+ CSRF on every write). `MasterMenu` gains `reserve`. `currency.options` and `memoStock.list` are also readable with `reserve:VIEW`. |
| SA-RS-03 | **Numbers:** Document Setup key `reserve` (exists, code RS), with the SA-MO-04 rules. `NumberedDocument` gains `reserve` (advisory key `partner.reserve.plain_running_no`). Document Setup `used` also counts reserves. |
| SA-RS-04 | **Party, header, lines and totals** as Memo Out (SA-MO-05/06):<br>• An active customer with a SHIPPING and an INVOICE address.<br>• Currency active or stored; exchange rate required for a foreign currency (the page uses the Selling Rate).<br>• ≤ 200 lines; server totals; no photos. |
| SA-RS-05 | **Status:** PENDING_APPROVAL → APPROVED only (`reserve.approve`). Update and delete need PENDING_APPROVAL, else `RESERVE_STATUS_INVALID` (409). No cancel / release in this revision (Q-RS-03). |
| SA-RS-06 | **From Stock lines (Q-RS-01/04/06):** saving runs the Memo Out stock-line rules (SA-MO-13):<br>• The item must exist (`RESERVE_REFERENCE_INVALID` `lines.N.memoStockId`) and appear once (`duplicate`).<br>• Pcs / weight ≤ the item's pending (`exceeds_pending`), and pcs or weight > 0.<br>• Item fields and price unit are copied, and stone code stays empty.<br>• The Sale Price is required (> 0).<br>Saving holds nothing. Manual lines (no `memoStockId`) hold nothing. |
| SA-RS-07 | **Approve holds stock (Q-RS-02, Q-MOV-04):**<br>• One `WRITE_TX` with a guarded status UPDATE (0 rows → NOT_FOUND / STATUS_INVALID / CHANGED).<br>• Then the shared `takeFromMemoStock(…, "reserved", …)`: it locks the items in id order and checks that each line is ≤ the current pending. Short → `RESERVE_PENDING_SHORT` (409, line fields), and nothing changes.<br>• Otherwise `pending -= q, reserved += q`.<br>Memo Out and Reserve share the bucket and the lock, so between them they never take more than pending. Log `reserve.approved` (id, docNo, stock line count). |
| SA-RS-08 | **Code reuse:**<br>• The customer party adapter, the stock-line `prepare` + line hook and the approve body move from `memo-out.service.ts` into one shared module, parameterised by the document's errors and models.<br>• `MemoOutService` and the new `ReserveService` both use it, and the Memo Out behaviour and contract are unchanged.<br>• `ReserveService` is otherwise the Memo Out configuration with `document: "reserve"`. |
| SA-RS-09 | **Not in this revision:** release / cancel of an approved Reserve (Q-RS-03); Sale moving Reserve → Sold; our own stock in From Stock (inventory, ADR-0027); line photos; links from a Reserve to a Memo Out of the same stones. |

Capacity: the same as Memo Out SA rev 2. Approval locks ≤ 200 `memo_stock` rows in one transaction; From Stock is ≤ 51 rows on `memo_stock_pending_all_idx`. Thousands of documents a year are expected, so the pool and container limits are unchanged.
