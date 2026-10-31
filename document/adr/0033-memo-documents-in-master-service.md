# ADR-0033: Memo Out and Memo Out Return documents in the master service (before inventory)

- Status: Accepted (2026-10-28)
- Date: 2026-10-28
- Feature: `memo-out` (UI rev 1) and `memo-out-return` (UI rev 2)
- SA revision: 1 ([decisions](../apps/backend/master/memo-out/decisions.md), [API contract](../apps/backend/master/memo-out/api-contract.md))
- Deciders: project owner
- Approval evidence:
  - Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย". This is a direct instruction to build the API.
  - Owner answer the same day to the party question: "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor".
- Related: [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0032](0032-quotation-backend-in-master-service.md), [document-setup SA rev 1](../apps/backend/master/document-setup/decisions.md)

## Context

Memo Out (stones sent to a customer on memo) and Memo Out Return (a vendor document) have UI specs and page structures. The owner asked for real saving with numbers from Document Setup. ADR-0027 puts stock documents and movements in a future inventory service, which is not built or authorized yet.

## Decision

1. **Owner:** `backend-api-master`, schema `partner`, tables `memo_out(_line, _charge)` and `memo_out_return(_line, _charge)`. Migration `20261028090000_memo_out` is additive. No new service, container or network.
2. **One shared engine** (`src/trade-document/document-engine.ts`) instead of a copy per document. The engine provides the quotation rules:
   - Document Setup number: max + 1 under the numbering-row lock, plain 1, 2, 3 … when no row is in effect.
   - Snapshots of the party and its addresses.
   - Server totals with the quotation calculator.
   - Optimistic `version`.
   - Drafts only, in revision 1.
   Each document plugs in a party adapter. Memo Out uses a customer with SHIPPING and INVOICE addresses; Memo Out Return uses a vendor with one address. The numbering helpers take the document type, and Document Setup counts a row as used when a quotation, memo out or memo out return references it.
3. **No stock posting and no photos in revision 1.**
   - Saving changes no stock data. Posting moves to the inventory service later (ADR-0027).
   - Line photos are rejected (`photoIds` must be empty) until a photo route is added.
   - From Stock (Memo Out) and Memo Outstanding (Memo Out Return) stay disabled. Memo Out Return lines are typed by hand, because no vendor memo source exists yet.
4. **Permissions:** existing catalog leaves `memo-out` and `memo-out-return` (VIEW/ADD/EDIT/DELETE). `currency.options` is also readable with them.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Copy the quotation service per document | Two more ~500-line copies drift apart; the engine keeps one implementation of numbering, totals and guards. |
| Generic single `document` table | Party columns differ per document; per-type tables keep CHECKs and FKs simple and a later move to inventory mechanical. |
| Wait for the inventory service | Not authorized; blocks saving entirely. |

## Consequences

- The quotation code keeps its behavior. Its shared parts (`tradeDocumentFields`/`tradeDocumentRules`, `stoneLineOptions`, `customerLineOptions`, numbering helpers) are now exported and reused.
- The frontend has one shared document form (`features/trade-document/document-form.tsx`) on the Quotation components. The row-panel photo field shows "come in a later update" on memo documents.
- Bounds as quotation: ≤ 200 lines, list pages ≤ 50, options ≤ 1,000 rows, one transaction per save. No new process or cache.

## Revision 2 (2026-10-31): Memo Out approval cuts Memo Stock — **Accepted** (owner 2026-10-31: "อนุมัติ memo-out revision 2")

- Source: owner 2026-10-31, "sa frontend backend Memo Out คือการตัดของจาก from stock โดยของจาก from stock จะมาจาก memoin และเมื่อทำ flow ของ Memo Out เสร็จของจะถูกตัดจริงๆ".
- Owner answers: Q-MO-09…12 (2026-10-31) and earlier Q-MR-11/14/15 and Q-MOV-04.
- SA: [memo-out SA revision 2](../apps/backend/master/memo-out/decisions.md).

**Context.** Revision 1 kept Memo Out as a draft-only document with manual lines (Q-MO-01/02), waiting for the inventory service. Memo Stock now exists in this service (ADR-0034), and the Memo Outstanding report already has a Reserve bucket (ADR-0035). That bucket expects "Memo Out approved" to fill it.

**Decision.**
1. Memo Out gets the memo receive status flow: PENDING_APPROVAL → APPROVED, with `memoOut.approve` (`memo-out:APPROVE`).
2. A Memo Out line may name a Memo Stock item, chosen with **From Stock**. Saving checks the item and copies its details but reserves nothing.
3. Approval moves each stock line's quantity from the item's pending into **Reserve**, under row locks and with the over-pull guard. That is the same pattern as Memo Return approval moving pending into Return.
4. Manual lines stay allowed and cut nothing.
5. `memoStock.list` serves From Stock across vendors.

**Alternatives.**

| Alternative | Reason not chosen |
|---|---|
| Cut stock on save | The owner chose approval (Q-MR-15). Cutting on save would need undo on every edit and delete. |
| A movement / ledger table | Same reasoning as ADR-0035: bucket counters with a balance CHECK are enough for interim memo stock. A ledger belongs to the inventory service (ADR-0027). |
| Only From Stock rows | The owner keeps manual rows (Q-MO-09). |

**Consequences.**
- One additive migration. Existing drafts become Pending Approval.
- Memo Out Return does not yet return Reserve to pending (Q-MO-12), so reserved stones stay reserved until that revision.
- This is still the interim deviation from ADR-0027 that ADR-0034 accepted. When inventory exists, From Stock also lists our own stock.
- No new process, cache or package. Approval is one transaction locking ≤ 200 rows.

## Revision 3 (2026-10-31): Memo Out Return brings Memo Out goods back — **Accepted** (Owner 2026-10-31: "อนุมัติ memo-out-return revision 4")

- Source: owner 2026-10-31, "memoout คือการนำของของเราไปให้เขายืม … หน้า memo out return คือนำของๆเราที่ทำ memo out กลับมาเข้าคลังตัวเอง กดที่ปุ่มmem outstanding จะสามารถดูของที่ทำmemo out ออกไปได้เเล้วเลือกเพื่อนำกลับเข้ามาคืนคลังตัวเอง".
- Questions: Q-MOR-11…18 (proposed defaults). SA: [memo-out-return SA revision 2](../apps/backend/master/memo-out-return/decisions.md). Flow: [memo-out-return-flow](../diagram/memo-out-return-flow.md).

**Context.** Revision 2 made Memo Out approval move Memo Stock pending into Reserve, and left the return for later (Q-MO-12). Memo Out Return is still draft-only, vendor-based and has no line source (Q-MOR-10). The owner now defines it as bringing the lent goods back from the borrower into our store.

**Decision.**
1. The Memo Out Return party becomes the **customer** with Shipping and Invoice addresses, the same as on Memo Out. This replaces the 2026-10-28 vendor answer (Q-MOR-11/12, owner 2026-10-31).
2. Memo Out Return gets PENDING_APPROVAL → APPROVED with `memoOutReturn.approve`.
3. Lines come only from **Memo Outstanding**: approved Memo Out **From Stock** lines (Q-MOR-13: manual rows can't be returned) of that customer and currency that are not fully returned. Each return line references its Memo Out line.
4. Each Memo Out line keeps `returned_pcs` / `returned_weight_ct` counters. Outstanding = out − returned.
5. Approval, under row locks with an over-return guard, adds to the Memo Out line counters. It also moves the Memo Stock item's quantity from **Reserve back to pending**, only at approval (Q-MOR-14).

**Alternatives.**

| Alternative | Reason not chosen |
|---|---|
| Keep vendor as the party | The goods are with the customer who borrowed them. A vendor-side return of Memo Stock is already Memo Return. |
| Compute outstanding by summing approved returns each time | It needs aggregation on every picker load and every approval. Counters with a CHECK follow the ADR-0035 bucket pattern and lock cleanly. |
| Return on save | Same reasoning as Q-MR-15: approval is the cut point, and save stays undo-free. |
| A stock ledger | Belongs to the inventory service (ADR-0027), as ADR-0035 already decided. |

**Consequences.**
- One guarded migration. It stops if Memo Out Return rows exist, because the party columns change.
- The Memo Outstanding › Vendor report shows Reserve falling with no change of its own.
- Our own stock and the Memo Outstanding › Customer report remain later work.
- No new process, cache, package or container. Approval locks ≤ 200 + ≤ 200 rows in one transaction.
