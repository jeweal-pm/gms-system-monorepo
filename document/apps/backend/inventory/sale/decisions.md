# SA decisions: inventory / sale, SA revision 1

- Feature ID / SA revision / source UI: `sale` / **1** / [UI revision 1](../../../frontend/sale/ui-spec.md) (approved 2026-11-18) with the defaults of Q-SL-01…16
- Status: **approved** 2026-11-18 — owner "อนุมัติทั้งสอง" in chat, 2026-11-18 (UI rev 1 + SA rev 1 / ADR-0054; Q-SL-01…16 and SQ-SL-01…04 take their defaults; Sale in backend-api-inventory).
- Approval evidence: none. Owner request 2026-11-17 ("sa uxui เขียน adr และ ui spec หน้า sale …") authorizes design only.
- ADR: [ADR-0054](../../../../adr/0054-sale-document.md) (Accepted), SA questions SQ-SL-01…04 there.
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Main flow: [diagram/sale-flow.md](../../../../diagram/sale-flow.md). TODO: [task/todo/sale.md](../../../../task/todo/sale.md) (BE-SL-*, INF-SL-001, DO-SL-001). Handoff answered: [sale-sa](../../../../coordination/handoffs/sale-sa.md) SA-SL-01…12.
- Reused designs: [inventory/load-to-stock SA rev 1](../load-to-stock/decisions.md) (saga, numbering, approval, notifications, photos — approved 2026-11-17), [master/reserve](../../master/reserve/decisions.md), [master/purchase](../../master/purchase/decisions.md) (Sold group), [master/memo-out-return](../../master/memo-out-return/decisions.md) (picking lines of another approved document, same customer + currency).
- Inspected code (2026-11-18): `backend-api-inventory/{prisma/schema.prisma, src/app.ts, src/platform/sync/saga.ts, src/platform/master-api.ts, src/platform/approval/settings.ts}`, `backend-api-master/{prisma/schema.prisma (MemoStock, Reserve, ReserveLine, ReserveCharge), src/trade-document/{memo-stock.service.ts, customer-stock-document.ts, reserve.service.ts, source-lock.ts, memo-receive.service.ts}, src/inventory-internal/*, src/approval-setting/approval-types.ts, src/master/{authorization.ts, router.ts}}`, `docker/nginx/gms-dev.conf`, `backend-api-auth/src/permission/catalog.ts`.

## Answers to the handoff (SA-SL-01…12)

| ID | Decision |
|---|---|
| SA-SL-01 | **Placement: `backend-api-inventory`, module `src/modules/sale/`** (ADR-0054 D1). ADR-0052 D1 is followed, not amended. Master alternative costed in ADR-0054 and offered as SQ-SL-01. Cost comparison below. |
| SA-SL-02 | Tables `inventory.sale`, `sale_line`, `sale_charge`, `sale_line_photo`, `sale_sync_op` ([database-diagram](database-diagram.md)); REST `GET /sale/options`, `/sale/next-number`, `/sale`, `/sale/{id}` ([api-contract](api-contract.md)). Master: `MasterMenu` `sale`; `currency.options` and `memoStock.list` accept `sale:VIEW`. Document Setup key `sale` via the internal numbering call; "used" marking through `external_used_at` (existing). Auth leaf `sale` exists (no catalog change). |
| SA-SL-03 | Lines `RESERVE` (names `reserveLineId`) or `STOCK` (names `memoStockId`); unique per reference per document; pcs or weight > 0, each ≤ cap (open for RESERVE, pending for STOCK, plus this sale's own applied quantity on an auto-approved edit); Sale Price > 0; item fields copied from master at Save; field-addressed errors `lines.N.pcs|weightCt` `exceeds_open` / `exceeds_pending`, `SALE_REFERENCE_INVALID` with `lines.N.reference`. |
| SA-SL-04 | `reserve_line.sold_pcs/sold_weight_ct`; picker = open lines (`memo_stock_id IS NOT NULL AND (sold_pcs < pcs OR sold_weight_ct < weight_ct)`) of APPROVED, not-deleted Reserves of the customer in the currency, oldest Reserve first, keyset ≤ 50, search + Reserve date range, partial indexes. Consumption at apply: Reserve line sold += q, Memo Stock reserved → sold. Reserve stays APPROVED; detail shows sold per line (SQ-SL-04); Reserve becomes "used". Memo Out holds are never consumed. |
| SA-SL-05 | Memo Stock `pending → sold` with the `takeFromMemoStock` lock/guard family (new `sold` bucket). Effects confirmed: Purchase Sold group (`sold − purchased`), Memo Outstanding › Vendor Sold column (and Reserve column drops for From Reserve), Purchase Outstanding unchanged until purchased, Memo Outstanding › Customer unaffected. |
| SA-SL-06 | Own stock = phase 2 with prerequisites (ADR-0054 D11): stock/available read, Sale UI rev 2, SA rev 2; local `on_hand → sold` in tx0, price from Load Sale Price ÷ Selling Rate. FE-SL-012 / BE phase 2 stay blocked. |
| SA-SL-07 | ADR-0050 flow, approval type `sale` in `inventory.approval_setting` (default ON); stock moves only when applied; short → `409 SALE_SOURCE_SHORT` with line fields, nothing changes; edit-until-used for auto-approved sales (SQ-SL-02); Restore → DRAFT (SQ-SL-03); notifications per ADR-0049 in the inventory feed. |
| SA-SL-08 | Inventory Approve Center registers `sale` (summary count, pending list with party = customer, qty, value; preview = `GET /sale/{id}`). Frontend registry entry: `lineTable` = Sale item table, party customer, per-line source caption. |
| SA-SL-09 | Own line photos: `sale_line_photo` + `inventory.stored_file`, scope `files/sale/` via `@gms/storage`, permanent retention, nginx location (INF-SL-001). |
| SA-SL-10 | REST contract with `SALE_*` codes, CSRF on every mutation, all bounds ([api-contract](api-contract.md), [error-handling](error-handling.md)). |
| SA-SL-11 | [sequence-diagram](sequence-diagram.md) (save, approve with both sources, short, concurrent approvals, auto-approved save/edit/delete, unknown outcome, picker) and [database-diagram](database-diagram.md). |
| SA-SL-12 | Out of scope confirmed, no reserved columns: Receivable/payment (Account Outstanding module will read `sale` locally later), Sale Person (a later nullable column is cheap to add then), print/invoice, sale from Memo Out (a third source value later), reversal of approval-ON sales. `sale_line.source` CHECK is widened by those later revisions. |

## Placement cost comparison (SA-SL-01)

| Aspect | Inventory (chosen) | Master (alternative) |
|---|---|---|
| Owner boundary | as selected (ADR-0052 D1, Q-LS-36) | amends ADR-0052 D1 |
| Phase-1 stock moves | 1 idempotent master call per apply + local saga (driver exists) | 1 local transaction |
| Document engine | new Hono module: totals, party snapshot, approval, soft delete, photos (Load to Stock patterns; totals ported with parity tests) | reuses `CustomerStockDocument` |
| Phase 2 own stock | local `on_hand → sold` | master → inventory hold saga (D15 phase 2b API) |
| Sale Report / Account Outstanding (inventory) | local reads | cross-service reads of Sale data |
| Capacity | +≤ 2 internal calls per Save, 1 per apply; no new limits | none |
| Delivery effort | larger (≈ Load to Stock module size) | smaller |

## Divergences from reused designs

- Load to Stock has no Restore (Q-LS-33); Sale offers Restore → DRAFT (ADR-0045 default, SQ-SL-03).
- Load to Stock "used" = stock moved out of on-hand; Sale "used" = release would push Memo Stock `sold` below `purchased`.
- Reserve "used" changes from "never" to "any line sold" (ADR-0050 D4 amendment).
- The saga table is per document type (`sale_sync_op`), the driver is shared (generalised, Load to Stock behaviour unchanged).

## Approval

Covers ADR-0054, this bundle and the BE-SL/INF-SL/DO-SL rows. Record the owner's exact words in the TODO (`sa-approved-*`) and set ADR-0054 to Accepted only after that.
