# ADR-0038: Quotation From Stock (Memo Stock rows copied into a quotation, nothing held)

- Status: **Accepted** (2026-11-03)
- Date: 2026-11-03
- Feature / source UI revision: `quotation` / 2
- SA revision: 2 ([decisions](../apps/backend/master/quotation/decisions.md#sa-revision-2-2026-11-03--from-stock-approved), [API contract](../apps/backend/master/quotation/api-contract.md#sa-revision-2-2026-11-03--from-stock-lines-pending-review))
- Deciders: project owner
- Approval evidence: owner 2026-11-03: "อนุมัติ quotation revision 2 Memo Outstanding ไว้ก่อน" (covers this ADR, SA rev 2, ui-spec rev 2, TODO rev 2 and the Q-QTS-03…10 defaults)
- Related:
  - [ADR-0032](0032-quotation-backend-in-master-service.md) (Quotation backend; SA-QT-13 left From Stock disabled)
  - [ADR-0033](0033-memo-documents-in-master-service.md) revision 2 (Memo Out From Stock)
  - [ADR-0034](0034-memo-receive-approval-and-memo-stock.md) (Memo Stock)
  - [ADR-0036](0036-reserve-document.md) (Reserve, the shared From Stock module)
  - [ADR-0027](0027-gms-master-inventory-data-and-operations.md) (our own stock, later)

## Context

The Quotation page has had a From Stock button since revision 1, but it has been disabled with the tooltip "Stock isn't available yet" (SA-QT-13). Memo Out and Reserve now pick stones From Stock out of Memo Stock.

Owner request (2026-11-03, verbatim): "ปุ่ม From Stock แบบเดียวกับ Memo Out คือ มาจาก memostock + stockเราเอง ใช่ไหม แค่ดึงรายละเอียดของมาใส่ในใบเสนอราคา ไม่ตัดยอดอะไรทั้งนั้นไม่ approve ด้วย ทำเอกสาร เเละ adr มา"

- From Stock lists Memo Stock and, later, our own stock. Our own stock does not exist yet (it needs inventory, ADR-0027), so the list is Memo Stock only for now.
- Picking an item only copies its details into the quotation.
- Nothing is taken from or held in any stock bucket.
- Quotation keeps having no approval step (SA-QT-03a).

## Decision

1. **The From Stock button on the Quotation page is enabled.** It opens the shared Memo Stock picker that Memo Out and Reserve use. The picker shows items that still have something pending, from every vendor, and no price columns.
2. **A quotation line can be a stock line** (`source = "STOCK"`). It stores its Memo Stock item, the Stock ID and the pending it was picked with, in the same nullable columns Memo Out and Reserve lines have:
   - `memo_stock_id`
   - `stock_id`
   - `stock_pending_pcs`
   - `stock_pending_weight_ct`

   The server copies the item fields, the location `Memo` and the price unit from Memo Stock when the quotation is saved.
3. **Nothing is held, nothing is approved.**
   - Saving, editing or deleting a quotation never changes Memo Stock.
   - There is no row lock and no change to Memo Outstanding.
   - The quotation is saved as today: `APPROVED` on create (SA-QT-03a), with no Approve step.
4. **Rows typed by hand stay.** Unlike Memo Out and Reserve, Quotation keeps Add row and the key-in row panel. Stock rows and typed rows can be mixed on one quotation.
5. **One implementation of the stock-line rules.** The item lookup and field copy now in `customer-stock-document.ts` is extracted into a helper that Memo Out, Reserve and Quotation all call. Memo Out and Reserve behaviour does not change.
6. **Not now:**
   - our own stock in From Stock (inventory);
   - hiding stock-row prices from users without PRICE (Q-QT-07);
   - turning a quotation into a Reserve, Memo Out or Sale.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Copy the picked item into an ordinary typed row, with no link to Memo Stock | The quotation could not show the Stock ID, could not stop the same stone being added twice, and a later "quotation → Reserve/Sale" step would have no item to take. The link costs four nullable columns. |
| Hold the stock when the quotation is saved | The owner said quotations take nothing ("ไม่ตัดยอดอะไรทั้งนั้น"). A quotation is an offer, not a commitment. |
| Wait for our own stock and build From Stock once | Memo Stock already exists and the button is shown disabled. The picker and the line columns don't change when our own stock is added; only the item source grows. |

## Consequences and capacity

- One additive migration on `quotation_line`: four nullable columns, one FK (`memo_stock`, RESTRICT, indexed), one unique key (one item once per quotation), and one stock CHECK. Existing rows stay `MANUAL` with NULL stock columns. There is no backfill. Rollback (drop the columns) is safe while no stock line exists.
- `memoStock.list` also becomes readable with `quotation:VIEW`. No other permission change.
- Because nothing is held, the same stone can be on several quotations, and on a Memo Out or Reserve at the same time. A quotation can also outlive the stock it quotes, because its stock line keeps what was copied. That is the intended meaning of a quotation.
- Bounds:
  - The picker reads ≤ 51 rows per page from `memo_stock_pending_all_idx`.
  - A save reads ≤ 200 `memo_stock` rows by primary key, with no lock.
- No new process, cache, route, container or package ([tech-stack](tech-stack.md) unchanged). This fits the 4 GB / 2 vCPU host.

## Acceptance and approval

- From Stock opens the Memo Stock picker. OK adds the checked items as stock rows. Save stores them, and Memo Stock pending stays unchanged.
- Edit and Delete of a quotation with stock rows never touch Memo Stock.
- Typed rows, photos, totals and numbering are unchanged.
- This approval covers:
  - this ADR;
  - [ui-spec rev 2](../apps/frontend/quotation/ui-spec.md), [open questions Q-QTS-01…10](../apps/frontend/quotation/open-questions.md) and [testing](../apps/frontend/quotation/testing.md);
  - the [SA revision 2 sections](../apps/backend/master/quotation/decisions.md#sa-revision-2-2026-11-03--from-stock-approved) of the quotation decisions, API contract, database diagram and sequence diagram;
  - [main flow](../diagram/quotation-flow.md);
  - [TODO rev 2](../task/todo/quotation.md).

  No packages.
