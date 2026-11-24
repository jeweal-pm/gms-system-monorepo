# SA decisions: inventory / stock-adjustment, SA revision 1

- Feature ID / SA revision / source UI: `stock-adjustment` / **1** / [UI revision 1](../../../frontend/stock-adjustment/ui-spec.md) (approved 2026-11-24), using the defaults of Q-SAJ-01…12
- Status: **approved** 2026-11-24, owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more).
- Earlier request: The owner's request of 2026-11-24 ("สร้างโฟลเดอร์ และ วาง plan ออก adr ให้เมื่อมีคน pull ลงมาเเล้วให้claude อ่านเเล้วทำได้เลย") authorizes design work only.
- ADR: [ADR-0059](../../../../adr/0059-stock-adjustment-document.md) (Accepted)
- Bundle:
  - this file
  - [architecture](architecture.md)
  - [api-contract](api-contract.md)
  - [authorization](authorization.md)
  - [database-diagram](database-diagram.md)
  - [sequence-diagram](sequence-diagram.md)
  - [error-handling](error-handling.md)
  - [dependencies](dependencies.md)
  - [testing](testing.md)
  - flow: [diagram/stock-adjustment-flow.md](../../../../diagram/stock-adjustment-flow.md)
- Reused approved designs:
  - [inventory/sale](../sale/decisions.md): an inventory-owned document with approval, numbering, and local stock moves in one transaction.
  - [inventory/load-to-stock](../load-to-stock/decisions.md): numbering, approval settings, daybook.
  - [ADR-0055](../../../../adr/0055-lot-based-stock-picking-and-allocation.md): lot = `lot_key`; for our own stock, one lot is one Stock ID.
  - [ADR-0056](../../../../adr/0056-stock-card-report-in-inventory-service.md) D11: new ledger kinds need `CARD_KINDS` rows.
- Inspected code (2026-11-24):
  - `backend-api-inventory/prisma/schema.prisma` (`stock`, `stock_movement`)
  - `backend-api-inventory/prisma/migrations/20261123120000_sale_own_stock/migration.sql` (kind check)
  - `src/modules/stock/{stock.ts, lots.ts, holds.ts, card-kinds.ts}`
  - `src/modules/sale/{own-stock.ts, routes.ts, service.ts, repository.ts}`
  - `src/platform/{approval/settings.ts, master-api.ts, auth/principal.ts}`
  - `backend-api-master/src/inventory-internal/inventory-internal.schemas.ts`
  - `backend-api-master/src/document-setup/document-setup.transactions.ts`

## Decisions (SA-SAJ-nn)

### Implementation notes

- `/stock-adjustment/options` currently makes two cached Master API reads: `reference` for locations and `numbering` for the configured flag. `MasterApi` exposes these separately; adding a combined master endpoint would expand the approved scope, so the implementation keeps both existing calls and documents the deviation from the one-call target.

| ID | Decision |
|---|---|
| SA-SAJ-01 | **Placement:** `backend-api-inventory`, module `src/modules/stock-adjustment/` (ADR-0052 D1 / ADR-0027 already name it). There is no master stock call: the stock lives in inventory, so no saga is needed. |
| SA-SAJ-02 | **Tables:** `inventory.stock_adjustment` and `inventory.stock_adjustment_line` ([database-diagram](database-diagram.md)). Each line references `stock.id` and **snapshots** the on hand quantity and price at pick time (`stock_pcs`, `stock_weight_ct`, `stock_price`). |
| SA-SAJ-03 | **Effect** (apply), in one transaction, through a new helper `adjustStocks()` in `src/modules/stock/adjust.ts` (stock.ts says every module must move stock through `modules/stock`):<br>1. Lock the stock rows `FOR UPDATE ORDER BY id`.<br>2. Check that each row is ACTIVE, at the document location, and has on hand equal to the line snapshot.<br>3. Run one set-based UPDATE: `on_hand_pcs = physical_pcs`, `pcs = pcs + Δpcs`, the same for weight, `stock_price = physical_price` (Q-SAJ-01), `cost_amount_base += Δcost`, `first_used_at = coalesce(first_used_at, now())`, `version + 1`.<br>4. Write one `stock_movement` row per changed line, kind `ADJUST`, with signed deltas.<br>The pattern mirrors `consumeOwn` (`modules/sale/own-stock.ts`). |
| SA-SAJ-04 | **Ledger kinds:** `ADJUST` and `ADJUST_REVERSAL`, added to `stock_movement_kind_check` by a migration. The deltas are signed (pcs and weight may move in opposite directions in one line). Stock Card `CARD_KINDS` maps a positive delta to IN and a negative one to OUT, document type `stock-adjustment`. |
| SA-SAJ-05 | **Balance invariant:** `pcs = on_hand + reserved + memo_out + sold + consumed` (`stock_pcs_balance_check`) stays true because `pcs` and `on_hand` move by the same Δ. Physical ≥ 0, so on hand never goes negative. The other buckets are untouched. |
| SA-SAJ-06 | **Stale guard:** if the current on hand ≠ the snapshot, return `409 STOCK_ADJUSTMENT_STOCK_CHANGED` with the current values per line (Q-SAJ-04). No silent re-base. |
| SA-SAJ-07 | **Reverse** (edit/delete of an effective document): each line stores `applied_version` (stock version after apply) and `prev_stock_price`. Reverse is allowed only if every stock still has `version = applied_version`; otherwise `409 STOCK_ADJUSTMENT_IN_USE {stockIds}`. Reverse writes `ADJUST_REVERSAL` with negated deltas and restores the price. Soft delete follows ADR-0045 D8. |
| SA-SAJ-08 | **Approval** (ADR-0050, ADR-0052 D8): add type `stock-adjustment` to `INVENTORY_APPROVAL_TYPES` (`src/platform/approval/settings.ts`) and to the `approval_setting` type check. OFF → Save applies at once (APPROVED, `auto_approved`). ON → DRAFT → submit → PENDING_APPROVAL → approve applies. Revise at most once; Reject is final. `/approval/summary` and `/approval/pending` include the type. |
| SA-SAJ-09 | **Numbering:** master `POST /internal/v1/inventory/document-numbering/resolve` with the new key `stock-adjustment`. Widen `INVENTORY_NUMBERING_KEYS` (master `inventory-internal.schemas.ts`) and `NumberingKey` (inventory `platform/master-api.ts`). Document Setup already has the key with default code **SA**. The number is issued on the first Save. |
| SA-SAJ-10 | **From Stock read:** a new public `GET /stock-adjustment/stock?location=` built on `lotsAvailablePage` (`modules/stock/lots.ts`) with a location filter and an own-stock-only filter. The open-stock index already hides on hand = 0. It excludes the ids in `exclude`, uses keyset paging of ≤ 50, and runs one statement. |
| SA-SAJ-11 | **Locations:** `GET /stock-adjustment/options` returns `master.reference().locations` (cached, existing client) and `numbering.configured`. |
| SA-SAJ-12 | **Permissions:** menu leaf `stock-adjustment` (auth catalog exists). Add `"stock-adjustment"` to the `Menu` type (`platform/auth/principal.ts`). The grants are VIEW / ADD / EDIT / DELETE / APPROVE ([authorization](authorization.md)). |
| SA-SAJ-13 | **Bounds:** ≤ 200 lines per document (Q-SAJ-12), unique `stock_uuid` per document, JSON ≤ 256 KiB, no HTTP inside a transaction, and a fixed number of statements per apply. |

## SA questions (SQ-SAJ-nn): defaults approved 2026-11-24

| ID | Question | Default |
|---|---|---|
| SQ-SAJ-01 | Should an open (Draft/Pending) adjustment **hold** its stocks so that other documents can't move them? | **No hold.** Rely on the stale guard (SA-SAJ-06), because counts are usually quick. |
| SQ-SAJ-02 | Should Δcost use `unit_cost_base`? | Yes: `Δcost = Δ(qty by price_unit) × unit_cost_base`, rounded to 2 dp. |
| SQ-SAJ-03 | Notifications (bell) for submit/approve | The same events as Sale (`documentType: "stock-adjustment"`). |
