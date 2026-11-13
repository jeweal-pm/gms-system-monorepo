# ADR-0051: Purchase keyed-in and PO rows get no Stock ID until Load to Stock

- Status: Accepted (2026-11-13)
- Date: 2026-11-13
- Feature / source: `purchase` (UI rev 3 / SA rev 2). The owner's request on 2026-11-13: "อยากปรับใหม่ให้ pu ไม่มี stock id เหมือน po จะมี stock id ต่อเมื่อ load ของเข้า stock แล้ว".
- SA revision: purchase SA rev 3 (draft)
- Deciders: project owner
- Approval evidence: owner 2026-11-13 Q-PU-36 "ล้างเป็นค่าว่าง เลขที่ล้างแล้วจะไม่ถูกนำมาใช้ซ้ำ", Q-PU-37 "เป็น — ดีแล้ว", then "ไม่ต้องทำอะไรเพิ่ม ปรับ Pu กันก่อน" (Q-PU-38 default, start implementation)
- Amends: [ADR-0042](0042-purchase-document-and-stock-deduction.md) SA-PU-10 ("MANUAL / PURCHASE_ORDER lines get a Stock ID at Save"). Related: [INV-20261029-002](../task/investigation/INV-20261029-002-memo-receive-stock-id-exhaustion.md) (shared counter) and [INV-20261113-001](../task/investigation/INV-20261113-001-inv-fixes-review.md) Part B (Memo Receive / Purchase duplicate at the year boundary).

## Context

Today a Purchase row picked from Memo Stock (`STOCK`) keeps that item's Stock ID. A keyed-in row (`MANUAL`) or a Purchase Order row (`PURCHASE_ORDER`) gets a new Stock ID at Save. That ID comes from the counter `memo_stock_id_counter`, which Memo Receive also uses (`issueStockIds`). Purchase Order itself has no Stock ID.

The owner wants Purchase to work like Purchase Order for those rows. They have no Stock ID until the goods are loaded into stock (Load to Stock, not built yet).

This also removes the only second user of the counter, which closes INV-20261113-001 Part B. That issue is a duplicate Stock ID between Memo Receive and Purchase across the New Year midnight.

## Decision (proposed)

1. **Purchase rows**
   - `MANUAL` and `PURCHASE_ORDER` rows store **no Stock ID** (`purchase_line.stock_id` NULL).
   - `STOCK` rows keep the Memo Stock item's Stock ID, unchanged.
   - Purchase no longer calls `issueStockIds`. `PURCHASE_STOCK_ID_EXHAUSTED` is removed.
2. **Database:** one migration on `purchase_line`.
   - `stock_id` becomes nullable.
   - New CHECK: `(source = 'STOCK') = (stock_id IS NOT NULL)`.
   - The partial unique index `purchase_line_issued_stock_id_key` is dropped, since no issued IDs remain.
   - The `memo_stock_id_counter` is again used by Memo Receive only.
3. **Existing data** (Q-PU-36): the IDs already given to MANUAL / PO rows are cleared to NULL in the same migration. The counter is not rewound, so those numbers are simply never used.
4. **API:** `purchase.get` / `list` return `stockId: null` for those rows. The save input already ignores the Stock ID. The approve, merge and stock-deduction rules are unchanged, because only STOCK rows move Memo Stock.
5. **Pages:**
   - On the Purchase table, a MANUAL / PO row shows **"—"** in the Stock ID column (Q-PU-37). Before this change it showed "Auto" and then the issued number.
   - Searches by Stock ID (Approve Center, pickers) match STOCK rows only.
6. **Load to Stock (later):** when that page is designed, it issues the Stock ID from the same counter, the Memo Receive pattern. That design is a separate ADR.

## Alternatives

- **Keep IDs at Purchase Save, and fix the New Year race with a single counter lock**: this keeps today's behaviour, but it is not what the owner wants.
- **Give the ID at Purchase Approve**: still before the goods are in stock; rejected.

## Consequences and capacity

- A smaller save transaction for Purchase: no counter lock or upsert.
- INV-20261113-001 Part B is resolved by this design. Its fix (one global issuing lock) is no longer needed.
- Rollback: issue new IDs for rows with a NULL Stock ID and restore NOT NULL. The cleared numbers are not reused.
- No package, service or container change.

## Questions for the owner

| ID | Question | Default | Answer |
|---|---|---|---|
| Q-PU-36 | The dev database already has 7 Purchase rows (6 from PO, 1 keyed in) that were given a Stock ID. Clear them? | Clear them (NULL); the numbers are not reused | **Owner 2026-11-13: clear them; cleared numbers are not reused** |
| Q-PU-37 | What does a row without a Stock ID show in the Purchase table and the document preview? | "—" | **Owner 2026-11-13: "—"** |
| Q-PU-38 | Should Purchase Outstanding or any other report show these rows by Stock ID? | No change: those reports read Memo Stock (STOCK rows) only | **Owner 2026-11-13: "ไม่ต้องทำอะไรเพิ่ม" (default)** |

## Acceptance

- MANUAL and PO rows save, approve and reload with `stockId: null`. STOCK rows keep their ID. The counter does not move on a Purchase save.
- Migration: existing issued IDs are cleared and the CHECK holds. Purchase, merge and approval suites pass.
- Accepted 2026-11-13; implementation on branch `fix/12-11-26-inv`. INV-20261113-001 Part A is left for later (owner).
