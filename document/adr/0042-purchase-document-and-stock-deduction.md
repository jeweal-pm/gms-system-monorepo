# ADR-0042: Purchase document and its stock deduction from Memo Stock and Purchase Orders

- Status: Accepted
- Date: 2026-11-04
- Feature / source UI revision: `purchase` / 1 (approved), with the revision 2 pickers
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner 2026-11-04: "backend ทำ api เลย / logic หน้า PU หน้าจอการทำงานของ PU และ PO มีรูปแบบและโครงสร้างข้อมูลที่คล้ายคลึงกัน โดยข้อมูลหลักที่สามารถปรับเปลี่ยนได้ ได้แก่ จำนวน น้ำหนัก และราคา", clarified the same day: "Purchase ปุ่ม Memo Stock จะตัดจาก stock ของ memo และปุ่ม Purchase Order PU จะตัด stock จากการตัดใบ PO ที่มีการซื้อเข้าเข้ามา". The choices the owner did not state are SA defaults D1…D13 in [decisions.md](../apps/backend/master/purchase/decisions.md#sa-defaults--owner-may-change), and the owner may change them.
- Supersedes / related ADRs: [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0033](0033-memo-documents-in-master-service.md), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md), [ADR-0035](0035-memo-outstanding-vendor-report.md), [ADR-0036](0036-reserve-document.md), [ADR-0041](0041-purchase-order-document.md)

## Context

The Purchase (PU) page records stones bought from a vendor. Its rows come from three places:

- the vendor's **Memo Stock**, either still in stock or already sold to a customer;
- **approved Purchase Order lines** (SA-PO-05: Purchase is the only writer of `purchase_order_line.purchased_*`);
- rows keyed in by hand.

The owner wants PU shaped like PO, with only pcs, weight and price editable on picked rows. Memo Stock rows must cut memo stock, and PO rows must cut the outstanding of the PO being bought in.

The `memo_stock` table already has the `sold` bucket. It has no writer, and Q-MOV-04 says it fills the report's "PO/Purchase" column. No Sale or invoice entity exists. No own-stock store exists (ADR-0027 inventory is not built).

Bundle: [UI rev 1/2](../apps/frontend/purchase/ui-spec.md), [SA rev 1](../apps/backend/master/purchase/decisions.md), [TODO](../task/todo/purchase.md), [flow](../diagram/purchase-flow.md).

## Decision

1. **Storage.** Purchases live in `backend-api-master`, schema `partner`, in the tables `purchase`, `purchase_line` and `purchase_charge`. The shared `TradeDocumentEngine` drives them with the vendor party adapter. The Document Setup key is `purchase`.
2. **Line sources.** `purchase_line.source` is one of:
   - `STOCK`: a Memo Stock item and its `memo_group`, either `IN_STOCK` or `SOLD`;
   - `PURCHASE_ORDER`: an approved PO line;
   - `MANUAL`.

   The server copies every stone detail from the source. On picked rows the user changes only pcs, weight, price and the item note.
3. **Timing (SA default D2).** Save checks availability and moves no stock. **Approve** cuts the stock in one transaction, with `FOR UPDATE` row locks in id order and an over-pull guard. A short line gives `PURCHASE_PENDING_SHORT`, and nothing changes. This is the Q-MR-15 rule already used by Memo Return, Memo Out and Reserve. An approved purchase is read-only and cannot be un-approved.
4. **Memo Stock bucket (SA default D1).** `memo_stock` gains `purchased_pcs` / `purchased_weight_ct`, with the CHECK 0 ≤ purchased ≤ sold. At approve:
   - an `IN_STOCK` line moves pending → `sold` and adds the same quantity to `purchased`;
   - a `SOLD` line adds to `purchased` only.

   `memo_stock_balance` and Memo Outstanding › Vendor are unchanged. "Sold to customers, must be purchased" is `sold − purchased`.
5. **Purchase Order outstanding.** At approve, a `PURCHASE_ORDER` line adds to `purchase_order_line.purchased_*` under a row lock. The existing CHECK (purchased ≤ ordered) backs the guard.
6. **Pickers.** Two Purchase-specific queries, both gated by `purchase:VIEW`:
   - `purchase.memoStock`: SOLD / IN_STOCK rows, counts and Sold-first order;
   - `purchase.purchaseOrderLines`: open approved PO lines, counts.

   `memoStock.list` is unchanged. The sale-invoice fields and the piece type are returned as `null` until a Sale revision and a piece-type field exist. No invoice is invented.
7. **Stock IDs and own stock.** MANUAL and PO lines get a Stock ID at Save from the shared `YY####` counter. Own stock is deferred (SA default D4).

## Alternatives

- **Cut at Save** (a pending purchase holds its quantity). This was rejected as the default because no rule requires it after the owner's clarification. It would add hold/release logic to update and delete and diverge from Q-MR-15. The owner may still choose it (D2).
- **A separate `purchased` bucket, with `sold` meaning customer-only** (ui-spec recommendation). This is semantically clean, but it changes the `memo_stock_balance` CHECK, the vendor report SQL and its UI (the Q-MOV-02 identity). The counter design gives the same "sold − purchased" answer with no change to them. The owner may still choose it (D1).
- **Extend `memoStock.list`** with status and counts. Rejected: it would change the contract of four other pickers, and Q-PU-23 keeps them unchanged.
- **Interim own-stock table, or an `api-inventory` container now.** Rejected for revision 1: a new store, picker changes and possibly infra work. The deferral is recorded as a known gap.
- **Derive "Sold" from Memo Out or Memo Out Return.** Rejected: they record loans and returns, not sales.

## Consequences and capacity

- The migration `20261104150000_purchase` is additive. Rollback drops the three tables, the two `memo_stock` columns, the CHECK and two partial indexes. Approved purchases need the reversal statement in the [database diagram](../apps/backend/master/purchase/database-diagram.md) first. No auth migration (the leaf `purchase` exists). No nginx, container, image, volume, cache or package change.
- Known gap: bought stones cannot be picked From Stock (Memo Out, Reserve, Quotation) until own stock exists. The SOLD group stays empty until Sale exists.
- Load: a save is ≤ 200 lines plus primary-key source reads. An approve locks ≤ 200 `memo_stock` rows and ≤ 200 `purchase_order_line` rows and runs two bulk updates within `WRITE_TX` (4 s). Lists and pickers are keyset ≤ 50 with one bounded count. api-master stays at 0.25 vCPU / 384 MiB, and the 4 GB / 2 vCPU host budget (ADR-0024) is unchanged.

## Acceptance and approval

- UT-PU-B01…B05, GP-MT-PU and IT-PU-B01…B07 ([testing](../apps/backend/master/purchase/testing.md)) pass. Then TC-PU-* run in the browser.
- Covers: the SA rev 1 bundle (`document/apps/backend/master/purchase/**`), the flow diagram and this ADR. No library is added. Accepted 2026-11-04 on the evidence above.
