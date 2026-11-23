# SA decisions: lot-based stock (pick and deduct by Lot), SA revision 1

- Feature ID / SA revision / source UI: `lot-based-stock` / **1** / UI notes revision 1 in the [TODO](../../../../task/todo/lot-based-stock.md#ui-notes-ui-revision-1) (no design image)
- Status: **approved** 2026-11-20 — owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print)
- Approval evidence: owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print). Owner request 2026-11-20 (authorizes design only): "ถ้าต้องการเปลี่ยนจากการตัดผ่าน stock id ให้กลายเป็น lot แทน ของจาก lot เดียวกัน หากเป็นสีเดียวกันขนาด detail เหมือนกันให้รวมจำนวนกันเลย ให้ sa เขียน spec และแก้ไข modal ที่ใช้เป็น stock id เป็น lot แทน"
- ADR: [ADR-0055](../../../../adr/0055-lot-based-stock-picking-and-allocation.md) (Accepted)
- Services: `backend-api-master` (Memo Stock and every master document) and `backend-api-inventory` (own stock, Sale). This bundle is shared because one rule (lot key + allocation) applies in both. Each service keeps its own schema and writes; see [architecture](architecture.md).
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Main flow: [diagram/lot-based-stock-flow.md](../../../../diagram/lot-based-stock-flow.md). TODO: [task/todo/lot-based-stock.md](../../../../task/todo/lot-based-stock.md).
- Inspected (2026-11-20): `backend-api-master/prisma/schema.prisma` (MemoStock, MemoReceiveLine, QuotationLine, ReserveLine, MemoOutLine, MemoOutReturnLine, MemoReturnLine, PurchaseLine, SaleConsumption*, LoadStockId, InventorySyncOp), `backend-api-master/src/trade-document/{memo-stock.service.ts, from-stock.service.ts, stock-lines.ts, own-stock-lines.ts, inventory-hold-saga.ts}`, `backend-api-inventory/prisma/schema.prisma` (stock, stock_hold, stock_hold_document, stock_movement, sale_line), frontend `trade-document/{memo-stock-modal, stock-picker, picker-ui, from-stock-api, memo-stock-api, stock-ref}`, `purchase/components/purchase-pickers.tsx`, `sale/components/sale-pickers.tsx`, `memo-out-return/components/MemoOutstandingModal.tsx`, `load-to-stock/components/purchase-line-picker.tsx`. ADRs 0033–0036, 0038, 0042, 0043, 0051, 0052 (incl. amendment 2), 0054.

## Current state: where Stock ID is the unit

| Area | Stock ID use today | Code / schema |
|---|---|---|
| Memo Receive | Issues one Stock ID per line at Save (`YY####`); Approve creates one `memo_stock` row per line | `memo_receive_line.stock_id` unique, `memo_stock.stock_id` unique |
| Memo Stock buckets | pending / returned / reserved / sold / purchased per row; CHECK `memo_stock_balance`, `0 ≤ purchased ≤ sold` | `memo-stock.service.ts` `takeFromMemoStock` / `releaseToMemoStock` (id-ordered `FOR NO KEY UPDATE`, summed per item) |
| Memo Return | Add Memo Stock picker (`memoStock.list`, vendor + currency); line `memo_stock_id`, `stock_id` NOT NULL; approve pending → returned | `memo_return_line_memo_stock_key` |
| Quotation | Add From Stock (`fromStock.list`, Memo + own); copy only, no hold | `quotation_line.memo_stock_id` / `own_stock_id` unique per doc |
| Reserve | Add From Stock; approve pending → reserved (Memo) / RESERVED hold (own) | `reserve_line_memo_stock_key`, `reserve_line_own_stock_key` |
| Memo Out | Add From Stock; approve pending → reserved (Memo) / MEMO_OUT hold (own) | `memo_out_line_*_key`, open index |
| Memo Out Return | Memo Outstanding picker lists Memo Out lines (shows Stock ID · Lot); returns reserved → pending / MEMO_OUT_RETURN | `memo_out_return_line.memo_out_line_id` |
| Purchase | Add Memo Stock with Sold / In stock groups per row (`purchase.memoStock`), MERGED line (ADR-0043 rejected "merge by matching details across Stock IDs"); MANUAL / PO rows have no Stock ID (ADR-0051) | `purchase_line_memo_stock_key (purchase, memo_stock, memo_group)` |
| Purchase Order | No Stock ID | — |
| Load to Stock | From Purchase picker lists PU lines ("New on load"); applying issues one Stock ID per row into `inventory.stock` | `load_stock_id`, `stock.stock_id` unique |
| Own stock holds | Per (document, stock) in `stock_hold`; master → inventory `PUT stock-holds` set semantics | ADR-0052 D18/D19 |
| Sale | From Reserve (Reserve lines), From Stock (Memo Stock row); master consumption per (sale, line) naming one Memo Stock row | `sale_line.memo_stock_id` NOT NULL, `sale_consumption_line` PK (sale, line) |
| Reports | Memo Outstanding › Vendor and Purchase Outstanding per Memo Receive line (= Stock ID); Memo Outstanding › Customer per Memo Out line | read `memo_stock` / lines |
| Frontend | Every stock picker row key is a Stock row id (`pickKey`); column "Stone Code / Stock ID · Lot"; search "Stock ID, Lot, Stone, Cer No."; item tables show a Stock ID column | files listed above |

`lot` is `varchar(40) NOT NULL DEFAULT ''`, free text, on stock rows and every line. It is optional, and many rows have it empty.

## Decisions

| ID | Decision |
|---|---|
| SA-LOT-01 | Stock ID stays the ledger unit. Stock rows are never merged. Lot is a read-time group, and lines name the group (ADR-0055 D1). |
| SA-LOT-02 | Generated, stored `lot_key` on `partner.memo_stock` and `inventory.stock` with the D2 definitions. Every item-level detail is in the key, including all price fields and the item note (owner Q-LOT-04; the reading is in Q-LOT-04a/04b). A row with an empty lot or a certificate number is a group of one. |
| SA-LOT-03 | New lot pickers: master `memoStock.lots`, `purchase.memoStockLots`, `fromStock.lots`; inventory internal `stock/lots/available` for the fromStock merge. One row per group; the filter selects groups, and the quantities are always the whole group. |
| SA-LOT-04 | New lines name `lot_key` and store the group snapshot and `stock_count`. Unique per (document, source, lot_key). Validation is unchanged (≤ group available at Save, without locks). |
| SA-LOT-05 | Allocation at apply, oldest first (owner Q-LOT-06): FIFO (ref date ASC, Stock ID ASC), pcs and weight independently in the same order. Stored in `<doc>_line_alloc`. Release newest seq first; downstream settles oldest seq first. |
| SA-LOT-06 | One shared allocator module per service: master `trade-document/lot-allocation.ts`, inventory `platform/stock/lot-allocation.ts` (later, own-stock Sale). Both are pure functions over locked candidates, with property tests (sum = request, ≤ available, deterministic). |
| SA-LOT-07 | Locking: one id-ordered `FOR NO KEY UPDATE` per apply over `lot_key = ANY(keys)`, plus legacy ids. Bounds 500 per group / 2,000 per transaction, else `STOCK_LOT_TOO_LARGE`. |
| SA-LOT-08 | Own-stock lots in master documents: pre-read candidates, then allocate, then the unchanged per-stock hold PUT. Refusal maps back to the lot line. |
| SA-LOT-09 | Sale consumption contract v2: `lotKey` lines, and master returns allocations. `sale_consumption_line` keyed per memo stock. |
| SA-LOT-10 | No conversion of existing documents (owner Q-LOT-09). Applied legacy lines are backfilled into the allocation tables, one row each. Legacy lines are shown by Lot and details, without the Stock ID. |
| SA-LOT-11 | The Stock ID is not shown in the UI and cannot be searched (owner Q-LOT-10, Q-LOT-10a default). Public APIs return `lotKey` and the details only. Allocations keep their Stock ID snapshots in the database for audit and pass between services. Pages that create Stock IDs, and reports: Q-LOT-17/18. |
| SA-LOT-12 | Unchanged apart from hiding the Stock ID (Q-LOT-17/18): Memo Receive, Load to Stock, Purchase Order picker, Load From Purchase picker, vendor reports, `stock_hold` / `stock_movement` per stock, buckets, CHECKs, Approve Center counts, notifications, photos, infra, devops. |

## Per-document behaviour

| Document | Picker change | Apply (Memo Stock) | Apply (own stock) | Downstream |
|---|---|---|---|---|
| Quotation | Lot rows (fromStock.lots) | none (copy; availability = group sum) | none (pre-read sum) | — |
| Reserve | Lot rows | allocate FIFO pending → reserved | pre-read → allocate → RESERVED hold set | Sale From Reserve settles `reserve_line_alloc` FIFO |
| Memo Out | Lot rows | allocate FIFO pending → reserved | pre-read → allocate → MEMO_OUT hold set | Memo Out Return settles `memo_out_line_alloc` FIFO |
| Memo Out Return | Memo Outstanding rows show Lot and details, no Stock ID (one row per Memo Out line) | settle FIFO reserved → pending (`memo_out_return_line_alloc`) | MEMO_OUT_RETURN holds per settled stock | — |
| Memo Return | Lot rows (vendor + currency; price uniform by key) | allocate FIFO pending → returned (oldest borrowed first) | — (Memo Stock only) | — |
| Purchase (STOCK) | Lot rows in Sold / In stock groups; Merge question per lot | SOLD: FIFO over sold > purchased → purchased; IN_STOCK: FIFO pending → sold + purchased; MERGED: sold part first | — | Load to Stock unaffected (STOCK lines never loaded) |
| Sale | From Stock lot rows; From Reserve rows show Lot and details, no Stock ID | master allocates (STOCK lot) / settles (RESERVE) in the consumption call | phase 2 (ADR-0054 D11) uses the same rules locally | — |

## Owner questions (Q-LOT)

Owner follow-up 2026-11-20: the owner re-sent the coordinator's summary of the readings as the reply, which confirms Q-LOT-04a and Q-LOT-10a (recorded below). This is not bundle approval. Q-LOT-04b, 17 and 18 were then approved with their defaults (bundle approval above).

The owner answered four questions on 2026-11-20 (verbatim). These answers are **not** approval of the bundle: "Q-LOT-04: จะรวม lot ได้ถ้าหากของอันนั้น detail เหมือนกันทุกทุกช่อง / Q-LOT-06: ตัด Stock ID แบบของเก่าออกก่อน / Q-LOT-09: เอกสารเดิมไม่แปลง / Q-LOT-10: Stock ID จะไม่โชว์เลย". Approving "with the defaults" accepts each remaining default.

| ID | Question | Answer / recommended default | Alternatives |
|---|---|---|---|
| Q-LOT-01 | Which details must be equal to merge? | **Follows the owner's Q-LOT-04 answer: every item-level detail.**<br>• In the key: Lot (Q-LOT-02), Stone Code (our stock), Stone, Shape, Size, Color, Clarity, Cutting, Quality, Cer Type, Location, Price unit, every price field (Q-LOT-04b), Vendor, Currency, **Item note** (Q-LOT-04a).<br>• **Not** in the key: document-level data (source doc no., doc date, due date) and the Stock ID itself. | — |
| Q-LOT-02 | How are lot texts compared, and what happens to items without a lot? | Trimmed and case-insensitive. An empty lot is **never merged**. | Merge empty-lot items whose other details are all equal |
| Q-LOT-03 | Items with a certificate number | **Never merged** (a cer no. identifies one stone) | — |
| Q-LOT-04 | Merge when any detail differs (e.g. price)? | **Owner 2026-11-20: merge only when every detail field is identical** | — | **Owner change 2026-11-21:** every detail must match **except the price**; differing prices are averaged (Q1). |
| Q-LOT-04a | Is the **item note** one of the "details" in the owner's answer? | **Owner-confirmed 2026-11-20: yes.** Items with different notes are not merged. Document-level data (source doc no., dates, Stock ID) is not in the key. | Leave the note out of the key (the merged row then shows "Multiple notes") |
| Q-LOT-04b | Which **price** fields count? | **Default accepted 2026-11-20:** all price fields stored on the item:<br>• Memo Stock: unit price and net price (after discount);<br>• our stock: cost unit price, Stock Price and Sale Price;<br>• plus price unit, vendor and currency. | Only the price the picker shows (Memo Stock net price; nothing for our stock) | **Owner change 2026-11-21:** no price field is in the key any more (Q1); the lot row shows the quantity-weighted average. |
| Q-LOT-05 | Same lot in Memo Stock and in our stock | **Separate rows** (different owners; Location tells them apart) | — |
| Q-LOT-06 | Which Stock IDs are taken when part of a lot is picked? | **Owner 2026-11-20: oldest first** (oldest receive/load date, then lowest Stock ID). Memo Return returns the oldest borrowed first. Purchase pays the sold part first, then the oldest. | — |
| Q-LOT-07 | Returning or selling part of a lot line that holds several Stock IDs | The oldest held stock goes first. Undoing an edit gives back the newest first. | Proportional |
| Q-LOT-08 | Which pickers change in this revision? | • Lot rows: Add Memo Stock (Memo Return), Add From Stock (Quotation, Reserve, Memo Out, Sale), Purchase Add Memo Stock.<br>• Lot and details instead of the Stock ID: Sale From Reserve, Memo Out Return Memo Outstanding.<br>• No change: Purchase Order picker. Load From Purchase is covered by Q-LOT-17. | Memo Stock first, our stock later |
| Q-LOT-09 | Existing documents | **Owner 2026-11-20: not converted.** Lines keep their stock reference and quantities, and are **displayed by Lot and details** (Q-LOT-10). A line with no lot shows "—" in the Lot column. | — |
| Q-LOT-10 | Where is the Stock ID shown? | **Owner 2026-11-20: nowhere.**<br>• No Stock ID, count, popover, allocation list, column or sub-label in pickers, item tables, row panels, Approve Center or document previews, or prints.<br>• Public APIs stop returning Stock IDs.<br>• Allocations and Stock IDs stay stored on the server for audit. | — | **Owner change 2026-11-21:** the Stock ID is hidden **only** on Quotation, Reserve, Memo Out, Purchase and Memo Return (their pickers and outputs, Q3); it is shown again elsewhere. |
| Q-LOT-10a | Can users still **search** by Stock ID? | **Owner-confirmed 2026-11-20: no.** Search covers Lot, Stone, Stone Code, Cer No. and source doc no., including the Approve Center search. Allocations stay stored on the server for audit. Existing documents show their Lot instead of the Stock ID. | A hidden Stock ID search (it matches, but the ID is never shown; confusing) |
| Q-LOT-11 | Picker order | Newest arrival in the lot first | Lot A→Z |

_Owner 2026-11-20 (after approval): "ช่วยแก้ให้ปุ่ม from stock ทุกอันดึงของจาก load มาก่อนได้มั้ย" — in the customer-side From Stock picker (`fromStock.list`: Quotation, Reserve, Memo Out) our stock from Load to Stock is listed FIRST, then Memo Stock; Q-LOT-11 applies within each section. Already implemented on the Stock ID list (`from-stock.service.ts` `ownFirstPage`, cursor sections `o:` / `m:`); BE-LOT / FE-LOT picker work must keep it._
| Q-LOT-12 | Search or date filter on a lot | The lot is listed when **any** of its items matches; the quantities cover the whole lot | Sum only the matching items |
| Q-LOT-13 | Report figures | **Unchanged** (per Memo Receive line and Memo Out line). Whether the Stock ID column shows is Q-LOT-18. | Lot-level vendor reports (separate revision) |
| Q-LOT-14 | Load to Stock rows of the same lot | **Not merged.** Each row still creates one stock. Physical merging belongs to the later Merge/Split page. | Merge on load |
| Q-LOT-15 | Ref. on a merged lot row (the note is now uniform, because it is in the key) | The newest source document plus "+n" | Show every document |
| Q-LOT-16 | Purchase "Merge?" question (ADR-0043) | Kept, per lot | Remove |
| Q-LOT-17 | Memo Receive and Load to Stock **create** Stock IDs and show them today:<br>• Memo Receive: a line column after save;<br>• Load to Stock: "Auto", then the issued ID, in the table, row panel, source table and mode dialog;<br>• From Purchase picker: "New on load".<br>Hide them there too? | **Default accepted 2026-11-20: hide them there too.** The server still issues and stores Stock IDs; those columns show Lot instead (BE-LOT-012, FE-LOT-009). | Keep the Stock ID only on these two pages, e.g. for barcode labels later | **Owner change 2026-11-21:** superseded by Q3: Memo Receive and Load to Stock show the Stock ID again. |
| Q-LOT-18 | Memo Outstanding › Vendor shows the Stock ID in its table and print view (one row per Memo Receive line) | **Default accepted 2026-11-20: hide the column.** Rows stay per item, identified by Lot and details. | Keep it in reports only | **Owner change 2026-11-21:** superseded by Q3: Memo Outstanding › Vendor (and Customer) show the Stock ID again. |

## Divergences and risks

- ADR-0043 rejected merging across Stock IDs (Q-PU-24: "Stock IDs identify the physical stone"). This revision reverses that for lots without a certificate. Certificate stones keep the physical identity (Q-LOT-03).
- Allocation of pcs and weight is independent. A row can receive pcs and the next row the remaining weight. Today's CHECKs allow this, the allocation is visible, and an exact per-stone split is not tracked by design (the lot is treated as interchangeable).
- With the Stock ID hidden, two identical items without a lot look the same in a picker, although they stay separate rows. No one can trace a stone by its ID in the UI; that needs the stored allocations, through a database query or a later audit view.
- The full-detail key (note and prices included) merges less than a colour/size-only rule would.
- Own-stock pre-read can race. The inventory guard refuses, and the user retries; stock is never oversold.
- Free-text lot typos make separate lots (data quality; a Lot master is out of scope).
- **Lots over 500 open rows cannot be picked (INV-20261121-002 H4):** apply and own-stock pre-read refuse a lot above 500 open stock rows (or a transaction above 2,000) with `422 STOCK_LOT_TOO_LARGE` (D6); the picker still lists such a lot (sums cover all rows), so a user can add the line and fail at Approve. Not expected at the stated data volume (thousands of rows a year); the remedy is a later Merge/Split or a chunked allocation. Documented, not fixed in this revision.

## Owner change 2026-11-21

Direct owner instruction (authorizes the change of the approved design), verbatim: "Q1: แบบ ก lot สามารถซ้ำกันได้ ต้อง detail ต้องตรงกันทุกอย่างถึงจะสามารถรวมกันได้ยกเว้น ราคา ถ้าราคา ต่างกันจะเอาสองค่ามาเฉลี่ยกัน / Q2: ทำ From Stock ของ Quotation / Reserve / Memo Out ก่อน แล้วค่อยทำ Purchase, Memo Return และ Sale เป็นรอบถัดไป / Q3: ซ่อน Stock ID เฉพาะ Quotation, Reserve, Memo Out, Purchase, Memo Return / Q4: ของจาก Load (own stock) ไม่ต้องรวม Lot ในรอบนี้"

| # | Change | Backend effect |
|---|---|---|
| Q1 | Merge when every detail matches **except the price**; different prices are averaged. | New migration `20261121090000_lot_key_without_price` redefines `memo_stock.lot_key` without `unit_price` / `net_unit_price` (vendor, currency, item note, the empty-lot and certificate rules stay). Lot rows (`memoStock.lots`, `fromStock.lots`, `purchase.memoStockLots`) and lot-line snapshots show `unitPrice` / `netUnitPrice` as the **average weighted by the open quantity in the price unit** (weight for PER_CT, pcs for PER_PCS; the plain average when nothing is open); `amount` = Σ item amounts. With equal quantities this is the plain average of the values the owner described; with unequal quantities it differs (SA choice, to confirm). Allocation, buckets, Purchase cost, Memo Return and the reports keep each Stock ID's own price. |
| Q2 | Frontend rollout: From Stock of Quotation / Reserve / Memo Out first; Purchase, Memo Return and Sale next round. | No backend change: every lot procedure and path stays available. |
| Q3 | Hide the Stock ID only on Quotation, Reserve, Memo Out, Purchase, Memo Return. | Those five keep `stockId: null` in get / save outputs and their pickers; their Approve Center search uses the lot. Memo Receive, Load to Stock, Memo Outstanding › Vendor / Customer, Memo Out Return (picker + lines, Stock ID search) and Sale (detail, From Reserve rows, `SALE_IN_USE {stockIds}`) return the real Stock ID again ("" / null on a lot line). |
| Q4 | Own stock (Load) is not merged this round. | New inventory migration `20261121090000_own_lot_key_per_stock`: `stock.lot_key = 'OS' || id` for every stock, so each own-stock row of `fromStock.lots` is one stock (`merged: false`, still listed first) and an own-stock lot line names exactly one stock (allocation and hold paths unchanged). Chosen as the least risky way: no code path changes, only the key. |

Both migrations refuse to run while any document / Sale line already names a lot (none exist on dev or production).
