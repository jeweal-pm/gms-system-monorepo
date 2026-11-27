# ADR-0059: Stock Adjustment document in `backend-api-inventory`, setting own stock on hand to the counted quantity

- Status: **Accepted** 2026-11-24 (SA revision 1; owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more))
- Date: 2026-11-24
- Feature / source UI revision: `stock-adjustment` / UI revision 1 (approved 2026-11-24, [ui-spec](../apps/frontend/stock-adjustment/ui-spec.md), Q-SAJ-01…12 with defaults)
- SA revision: 1 ([decisions](../apps/backend/inventory/stock-adjustment/decisions.md))
- Frontend TODO / bundle: [task/todo/stock-adjustment.md](../task/todo/stock-adjustment.md)
- Deciders: project owner
- Approval evidence: owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more). Owner request 2026-11-24 ("สร้างโฟลเดอร์ และ วาง plan ออก adr …"); it authorizes this design work only.
- Supersedes / related ADRs:
  - [ADR-0027](0027-gms-master-inventory-data-and-operations.md) and [ADR-0052](0052-load-to-stock-in-backend-api-inventory.md): module placement, D8 approval, D10 numbering.
  - [ADR-0045](0045-transaction-document-soft-delete.md): soft delete.
  - [ADR-0050](0050-approval-setting-draft-send-to-approve.md): approval flow.
  - [ADR-0053](0053-location-master.md): locations.
  - [ADR-0055](0055-lot-based-stock-picking-and-allocation.md): lots.
  - [ADR-0056](0056-stock-card-report-in-inventory-service.md) D11: ledger kinds.
  - [ADR-0057](0057-stock-value-report-in-inventory-service.md): Stock Value.

## Context

The owner wants a stock-count document. The user picks lots of **our own stock** (from Load to Stock) at one **Main Location**:
- **Stock** shows the system's on hand quantity.
- **Physical** is what was counted (Pcs, Cts, Price).
- **Diff** shows the difference.

When the document takes effect, each Stock ID's on hand is **set to the Physical value**. That happens on Save when approval is OFF, or on Approve when approval is ON. From Stock lists only own stock at the Main Location and never lots with 0 on hand. Price is shown in all three groups.

What exists today:
- The menu, permission leaf and Document Setup key `stock-adjustment` (code `SA`) exist, but there are no tables, routes or page.
- ADR-0052 / 0027 already place the module in `backend-api-inventory`.
- `src/modules/stock/stock.ts` requires every stock change to go through `modules/stock`.
- Stock rows hold the bucket columns, with `pcs = on_hand + reserved + memo_out + sold + consumed` enforced by a check constraint.
- The ledger `stock_movement` is append-only, and its kinds are fixed by a check constraint that has no adjustment kind yet.

## Decision

- **D1 Placement:** module `backend-api-inventory/src/modules/stock-adjustment/` with REST `/api/inventory/v1/stock-adjustment*`. Stock is written only by a new `src/modules/stock/adjust.ts`. There is no master stock call and no saga.
- **D2 Data:** new tables `inventory.stock_adjustment` and `stock_adjustment_line`. Each line references `stock.id`, snapshots the on hand and price at pick time, and stores the Physical values ([database-diagram](../apps/backend/inventory/stock-adjustment/database-diagram.md)).
- **D3 Approval:** ADR-0050 flow with new inventory approval type `stock-adjustment` (settings list + DB check; summary and pending). With approval OFF, Save applies at once (APPROVED, auto). With approval ON, approve applies.
- **D4 Effect**, in one transaction:
  1. Lock the stocks `FOR UPDATE ORDER BY id`.
  2. Check: status ACTIVE, own stock, at the document location, and on hand = snapshot.
  3. One set-based UPDATE: `on_hand := physical`, `pcs += Δ` (same for weight, so the balance check holds), `version + 1`, `first_used_at` set (this makes the Load "used", ADR-0052).
  4. One `stock_movement` row per changed line, kind **`ADJUST`**, with signed deltas.
  - The other buckets (reserved, memo out, sold, consumed) are never touched.
- **D5 Stale guard:** if on hand differs from the snapshot, return `409 STOCK_ADJUSTMENT_STOCK_CHANGED` with the current values. Nothing is re-based silently. Open adjustments do **not** hold stock (SQ-SAJ-01).
- **D6 Price:** each group shows Price.
  - Stock Price = the lot's `stock_price`.
  - Physical Price defaults to it.
  - Diff Price = Physical − Stock.
  - **Draft default (Q-SAJ-01):** the Physical Price replaces `stock_price` on effect.
  - `unit_cost_base` is kept. `cost_amount_base` moves by `Δqty × unit_cost_base` and is written as `cost_delta_base` on the movement.
- **D7 Edit / delete after effect:** this is allowed only while every stock still has the version written at apply. The reversal writes **`ADJUST_REVERSAL`**, restores on hand and price, and then either re-applies (edit) or soft deletes (delete, ADR-0045). Otherwise it returns `409 STOCK_ADJUSTMENT_IN_USE`.
- **D8 Reports:** `CARD_KINDS` gains `ADJUST` / `ADJUST_REVERSAL` (a positive delta shows as IN, a negative one as OUT, document type `stock-adjustment`). Stock Value reads the changed on hand and price with no other change.
- **D9 From Stock:** new `GET /stock-adjustment/stock?location=` built on `lotsAvailablePage` (`modules/stock/lots.ts`), filtered to own stock, the location, and on hand > 0 (open-stock index). The frontend reuses the `MemoStockModal` dialog with this data source.
- **D10 Numbering:** master `document-numbering/resolve` with the new allowed key `stock-adjustment` (master `INVENTORY_NUMBERING_KEYS`, inventory `NumberingKey`). The default code is **SA**, and the number is issued on the first Save.
- **D11 Bounds:**
  - ≤ 200 lines and distinct stock per document.
  - Picker pages of ≤ 50 rows.
  - No HTTP call inside a transaction.
  - A fixed number of statements per apply.

## Alternatives

- **Place it in master** (like trade documents): this would need a new master → inventory stock-write API and a saga for every apply. Rejected because the stock and its ledger already live in inventory (ADR-0052 D1).
- **Post Diff as two separate documents (IN / OUT):** this adds no value and makes Stock Card harder to read. One signed `ADJUST` kind is simpler.
- **Hold stock while the document is open (Draft/Pending):** this blocks sales for the whole count. The stale guard is enough for a short count (it can be revisited later).
- **Re-base silently to the current on hand at approve:** this hides changes the counter never saw, so it is rejected (Q-SAJ-04).

## Consequences and capacity

- A migration adds 2 tables, ledger kinds, and the approval type, with no backfill. Rollback is to drop the tables and restore the old check lists while no `ADJUST*` rows exist.
- An apply of 200 lines takes ≈ 5 statements and row locks for the duration of one short transaction. Picker reads use the existing partial index. There is no new cache, job or container, which fits the 4 GB / 2 vCPU host.
- Stock Card, Stock Value and From Stock pickers on other documents see the new quantities right away.
- Approve Center gains a Stock Adjustment panel (this changes the Q-AP-08 default).

## Acceptance and approval

The decision covers:
- [UI bundle](../apps/frontend/stock-adjustment/ui-spec.md)
- [SA bundle](../apps/backend/inventory/stock-adjustment/decisions.md)
- [flow](../diagram/stock-adjustment-flow.md)
- [TODO](../task/todo/stock-adjustment.md)

Observable checks are listed in the backend and frontend `testing.md`: on hand equals Physical after effect, the balance check holds, the ADJUST ledger row appears on Stock Card, 0-quantity lots vanish from From Stock, and stale and in-use conflicts are refused.

Accepted 2026-11-24 with the evidence recorded in the header.
