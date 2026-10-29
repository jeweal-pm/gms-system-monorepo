# ADR-0034: Memo Receive API, approval and Memo Stock in the master service (before inventory)

- Status: Accepted (2026-10-29)
- Date: 2026-10-29
- Feature / source UI revision: `memo-receive` / 3
- SA revision: 1 ([decisions](../apps/backend/master/memo-receive/decisions.md), [API contract](../apps/backend/master/memo-receive/api-contract.md))
- Deciders: project owner
- Approval evidence: Owner 2026-10-29: "อนุมัติ memo-receive revision 3" (covers this ADR, SA rev 1, TODO rev 3, answers Q-MR-08…13). Owner flow 2026-10-29: "memo receive เหมือนการยืมของคนอื่นเข้ามาในคลัง memo stock ในระบบ เเล้วในหน้า memo return คือ คืนของในmemo stock ไปคืนเจ้าของ … เมื่อ approve memo receive จะสร้างของเป็นคลังใน memo stock … จะให้นำปุ่ม approve มาใส่ในหน้า memo receive ก่อน stock_id เป็นเลข running ปี สองหลัก เเละเลข running 4 หลัก เช่น 260001 นำlocation ออกในตาราง เเต่บันทึกไปใน db ว่า location คือ Memo เวลาเเสดงในปุ่ม from stock หรือ memo stock location แสดงว่า Memo"
- Supersedes / related ADRs: replaces the mock-document part of [ADR-0033 memo-receive frontend mock](0033-memo-receive-frontend-mock.md) (D1, D3 Stock ID format, Q-MR-03 location list). Builds on [ADR-0033 memo documents](0033-memo-documents-in-master-service.md) and [ADR-0032](0032-quotation-backend-in-master-service.md). Deviates for now from [ADR-0027](0027-gms-master-inventory-data-and-operations.md) "stock belongs to inventory" (see Decision 5).

## Context

Memo Receive records stones borrowed from a vendor on memo (consignment). The owner's flow:

1. Save a Memo Receive. It waits as **Pending Approval**.
2. **Approve** it. Each line becomes one item in **Memo Stock**, the stock of borrowed goods.
3. **Memo Return** sends Memo Stock items back to their vendor. Its "Add Memo Stock" dialog lists the pending items.

The Memo Receive page works today on mock documents ([TODO](../task/todo/memo-receive.md), FE-MR-001…006). No Memo Receive API, Approve page, Memo Return page or inventory service exists. Memo Out and Memo Out Return already save through the shared trade-document engine in `backend-api-master`.

## Decision

1. **Memo Receive documents** in `backend-api-master`, schema `partner`: tables `memo_receive`, `memo_receive_line` and `memo_receive_charge`, built on the shared `TradeDocumentEngine` with a vendor party adapter, like Memo Out Return. Numbers come from Document Setup key `memo-receive`. Lines have no photos in this revision.
2. **Status.** Save creates **PENDING_APPROVAL**. It can be edited and deleted only in that status. `memoReceive.approve` changes it to **APPROVED**, after which it is read-only. For now the Approve button is on the Memo Receive page itself. The later Approve page calls the same procedure. Reject and un-approve are not in this revision.
3. **Stock ID** = 2-digit year of the save + a 4-digit running number for that year, for example `260001` (owner Q-MR-08 2026-10-29: "ออกเลขตอนบันทึกปีนี้ปีไหนเอาปีนั้น"). The server assigns it to each new line when the document is saved, through a locked per-year counter. An existing line keeps its Stock ID when the document is edited, and a number is never reused. Clients cannot set it.
4. **Approval creates Memo Stock.** In one transaction, approval inserts one `memo_stock` row per line. Each row carries the Stock ID, lot, stone attributes, certificate, currency and vendor, with **location `Memo`**. Its price is the line price **after the line discount** (Q-MR-13). Pending pcs/weight start equal to the received pcs/weight. Memo Return will reduce them later.
5. **Interim ownership.** `memo_stock` lives in the master service until the inventory service of ADR-0027 exists. This is the same interim step ADR-0033 took for memo documents. It records no general stock movement, balance or posting. Moving it to `inventory` later is a planned expand/backfill/cutover. `memo_stock.id` and `stock_id` stay stable across that move.
6. **Location** is no longer entered on Memo Receive: the column and the row-panel select are removed. It is stored and shown as `Memo` in Memo Stock, in the "Add Memo Stock" dialog and in any later "From Stock" list.
7. **Memo Stock read** `memoStock.list` serves the Memo Return "Add Memo Stock" dialog. It filters by vendor, search text and receive-date range, shows only items with pending pcs or weight above 0, and returns pages of up to 50 rows.
8. **Permissions** use existing catalog leaves, so the catalog does not change. `memo-receive` gives VIEW/ADD/EDIT/DELETE, and its APPROVE action covers `approve`. `memoStock.list` needs VIEW on `memo-return` or `memo-receive`. `MasterMenu` gains `memo-receive` and `memo-return`.

Diagrams: [sequence](../apps/backend/master/memo-receive/sequence-diagram.md), [database](../apps/backend/master/memo-receive/database-diagram.md), [main flow](../diagram/memo-receive-flow.md). No new dependency ([tech-stack](tech-stack.md) unchanged).

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Wait for the inventory service (ADR-0027) | It is not authorized or built, and the owner wants to try the flow now. |
| No `memo_stock` table; Memo Return reads approved Memo Receive lines directly | Pending quantity would have to be derived from every return each time. The owner also names Memo Stock as its own store, and a separate table moves cleanly to inventory later. |
| Assign Stock ID at approval | The page already shows the Stock ID after save (FE-MR-002). Assigning at save keeps that, and approval stays a status change plus a copy. |
| Location select kept (mock list) | The owner removed it; all borrowed goods sit in `Memo`. |

## Consequences and capacity

- One additive migration with 5 tables and no backfill. Mock documents in the browser's `localStorage` are **not** imported; the page drops the mock store. Rollback: drop the new tables before any approved document exists. After that, roll forward only.
- No new container, service, volume, route, cache or package. Saving uses one transaction as Memo Out does (≤ 200 lines). Approval inserts ≤ 200 rows in one transaction. `memoStock.list` is a keyset page of ≤ 50 rows on a partial index, at most 2 queries.
- Expected data is small: thousands of memo items a year. The pool and limits of ADR-0027 are unchanged.
- Stock ID allows 9,999 items per year. Item 10,000 is refused with `MEMO_RECEIVE_STOCK_ID_EXHAUSTED`. The owner expects fewer than that a year and is still deciding the final rule (Q-MR-09).
- This is still a deviation from ADR-0027 until the move to inventory.

## Acceptance and approval

- Save → Pending Approval with Doc No. from Document Setup and Stock IDs `YY####`. Edit keeps the Stock IDs; delete is allowed only while pending.
- Approve → Approved and read-only. Each line appears once in Memo Stock with location `Memo`, and a second approve fails with 409.
- `memoStock.list` for the vendor returns the dialog's rows with pending pcs/weight and amount.
- Covers: this ADR; [`memo-receive` SA bundle rev 1](../apps/backend/master/memo-receive/decisions.md) (decisions, architecture, api-contract, sequence-diagram, database-diagram, authorization, error-handling, dependencies, testing); [main flow](../diagram/memo-receive-flow.md); [TODO revision 3](../task/todo/memo-receive.md); owner answers Q-MR-08…13 in [open-questions.md](../apps/frontend/memo-receive/open-questions.md). No packages.

## Revision 2 (2026-10-29): line photos — Accepted (Owner 2026-10-29: "อนุมัติ memo-receive revision 4")

Owner request: "ทำให้เพิ่มรูปได้เลยได้ไหม". Memo Receive lines get up to 5 photos, using the approved Quotation photo design: `@gms/storage` module `memo-receive-photo`, `stored_file` metadata, permanent retention (ADR-0030), and the shared upload/download limiter. There is one new nginx location, `/api/v1/memo-receive/photos`, and one new table, `memo_receive_line_photo`. There is no new container, volume or package. Decisions: SA-MR-14…19 ([decisions](../apps/backend/master/memo-receive/decisions.md#sa-revision-2-2026-10-29-line-photos--approved-owner-2026-10-29-อนุมัติ-memo-receive-revision-4)). The Revision 1 decisions stay Accepted. Approved separately by the evidence above.
