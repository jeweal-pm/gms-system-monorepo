# ADR-0055: Pick and deduct stock by Lot (merged lot entries allocated to Stock IDs)

- Status: **Accepted** 2026-11-20 (owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print))
- Amended 2026-11-21 by the owner (direct instruction, verbatim): "Q1: แบบ ก lot สามารถซ้ำกันได้ ต้อง detail ต้องตรงกันทุกอย่างถึงจะสามารถรวมกันได้ยกเว้น ราคา ถ้าราคา ต่างกันจะเอาสองค่ามาเฉลี่ยกัน / Q2: ทำ From Stock ของ Quotation / Reserve / Memo Out ก่อน แล้วค่อยทำ Purchase, Memo Return และ Sale เป็นรอบถัดไป / Q3: ซ่อน Stock ID เฉพาะ Quotation, Reserve, Memo Out, Purchase, Memo Return / Q4: ของจาก Load (own stock) ไม่ต้องรวม Lot ในรอบนี้". Effects: the Memo Stock lot key no longer contains any price (D2; lot rows show the quantity-weighted average price, each Stock ID keeps its own); our stock is not merged this round (inventory key = OS + id); the Stock ID is hidden only on Quotation, Reserve, Memo Out, Purchase and Memo Return (D9); frontend rollout From Stock first. Details: [decisions § Owner change 2026-11-21](../apps/backend/shared/lot-based-stock/decisions.md#owner-change-2026-11-21).
- Date: 2026-11-20
- Feature / source UI revision: `lot-based-stock` / UI notes revision 1 (in the [TODO](../task/todo/lot-based-stock.md#ui-notes-ui-revision-1)), no design image
- SA revision: 1, updated 2026-11-20 with the owner answers Q-LOT-04/06/09/10 ([decisions](../apps/backend/shared/lot-based-stock/decisions.md)); still pending review
- Owner follow-up 2026-11-20 (not approval): the item note is part of the key (Q-LOT-04a), and the Stock ID is not searchable, while allocations stay stored for audit and existing documents show their Lot (Q-LOT-10a). Both are confirmed. Q-LOT-04b, 17 and 18 are still open.
- Owner answers 2026-11-20 (not approval): "Q-LOT-04: จะรวม lot ได้ถ้าหากของอันนั้น detail เหมือนกันทุกทุกช่อง / Q-LOT-06: ตัด Stock ID แบบของเก่าออกก่อน / Q-LOT-09: เอกสารเดิมไม่แปลง / Q-LOT-10: Stock ID จะไม่โชว์เลย"
- Deciders: project owner
- Approval evidence: owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print). Owner request 2026-11-20 (authorizes this design work only): "ถ้าต้องการเปลี่ยนจากการตัดผ่าน stock id ให้กลายเป็น lot แทน ของจาก lot เดียวกัน หากเป็นสีเดียวกันขนาด detail เหมือนกันให้รวมจำนวนกันเลย ให้ sa เขียน spec และแก้ไข modal ที่ใช้เป็น stock id เป็น lot แทน"
- Supersedes / related ADRs (on acceptance): **reverses** the rejected alternative "Merge by matching details across Stock IDs" of [ADR-0043](0043-purchase-merged-memo-stock-line.md) (Q-PU-24); **amends** [ADR-0034](0034-memo-receive-approval-and-memo-stock.md) D7 (picker unit), [ADR-0036](0036-reserve-document.md) D1/D2, [ADR-0033](0033-memo-documents-in-master-service.md) (Memo Out / Memo Return / Memo Out Return stock lines), [ADR-0038](0038-quotation-from-stock.md), [ADR-0042](0042-purchase-document-and-stock-deduction.md) D2/D6, [ADR-0043](0043-purchase-merged-memo-stock-line.md) D1–D3 (applied per lot), [ADR-0052](0052-load-to-stock-in-backend-api-inventory.md) D16–D20 (From Stock rows, own-stock holds computed from a lot allocation) and [ADR-0054](0054-sale-document.md) D3–D6 (Sale lines and the consumption API). Follows [ADR-0024](0024-production-host-4gb-2vcpu.md), [ADR-0025](0025-gms-domain-routing-and-trpc.md), [ADR-0050](0050-approval-setting-draft-send-to-approve.md).
- Frontend TODO / bundle: [task/todo/lot-based-stock.md](../task/todo/lot-based-stock.md); service bundle [shared/lot-based-stock](../apps/backend/shared/lot-based-stock/architecture.md); flow [lot-based-stock-flow](../diagram/lot-based-stock-flow.md).

## Context

Every stock picker today lists one row per **Stock ID**: one `partner.memo_stock` row per approved Memo Receive line, and one `inventory.stock` row per applied Load to Stock row. Every stock-moving document line names exactly one of them (`memo_stock_id` or `own_stock_id`). Its buckets move on that one row:

- Memo Stock: `pending`, `returned`, `reserved`, `sold`, `purchased`;
- own stock: `on_hand`, `reserved`, `memo_out`, `sold`, `consumed`.

A lot (`lot varchar(40)`, free text, optional) is today only a badge next to the Stock ID.

The owner wants to pick and deduct **by Lot**. Items of the same lot with the same colour, size and other details become **one entry**, with their pcs and weight added together. The pickers that show Stock IDs must show Lots instead.

Constraints found in the checkout (2026-11-20, branch `feat/20-11-26-change-stockId-to-lot`):

- Stock IDs are the unit of every bucket CHECK, of the vendor reports (Memo Outstanding › Vendor, Purchase Outstanding: per Memo Receive line), of Load "used" (ADR-0052 D9), of the master → inventory hold API (`stock_hold` per stock) and of the inventory → master Sale consumption API (`sale_consumption_line` per Memo Stock item).
- Prices differ per Memo Stock row (`net_unit_price` after the receive-line discount). Cost differs per own-stock row (`unit_cost_base`).
- Certificates (`cer_no`) identify a single stone.
- `lot` is free text. It is empty on many rows.

## Decision

**D1 — Stock ID stays the stock unit; Lot becomes the picking unit.** Rows in `memo_stock` and `inventory.stock` are **not** merged or rewritten. Memo Receive and Load to Stock still issue one Stock ID per line or row (ADR-0034 D3, ADR-0052 D5). All bucket CHECKs, the vendor reports and the hold and consumption ledgers stay per Stock ID. A **lot group** is a read-time grouping of the available rows, and document lines name a group. Merging stones physically remains a later Merge/Split module.

**D2 — Lot key: every item detail must match (owner Q-LOT-04, 2026-11-20).** The owner answered "จะรวม lot ได้ถ้าหากของอันนั้น detail เหมือนกันทุกทุกช่อง": a lot merges only when **every item-level detail field is identical**. SA reads "every field" as every field stored on the stock item, **including the item note and every price field**. The owner confirmed the item-note reading on 2026-11-20 (Q-LOT-04a: items with different notes are not merged). The price-field reading (Q-LOT-04b) follows "every field" and stays recorded for confirmation. Document-level data is not part of the key: source document number, doc date, due date, and the Stock ID itself.

Each stock row gets a stored, generated column `lot_key varchar(40)`.

- Memo Stock, mergeable rows (trimmed `lot` ≠ '' and trimmed `cer_no` = ''): `'ML' || md5(` `upper(btrim(lot))`, vendor_id, currency_code, stone, shape, size, color, clarity, cutting, quality, cer_type, location, price_unit, unit_price, net_unit_price, item_note `)`.
- Own stock, mergeable rows: `'OL' || md5(` `upper(btrim(lot))`, vendor_id, currency_code, stone_code, stone, shape, size, color, clarity, cutting, quality, cer_type, location, price_unit, unit_cost_base, stock_price, sale_price, item_note `)`.
- Every other row (empty lot, or a certificate number) is a group of one: `'MS' || id` or `'OS' || id`.
- Memo Stock and own stock never share a group, because the prefixes differ and so do the owners and buckets.
- The fields are joined with the unit separator `chr(31)`. Attribute values compare exactly (they come from master options). Lot compares trimmed and case-insensitive.

**D3 — Lot pickers.** A picker row is a group of available rows:

- available quantity = Σ of the bucket the document takes from (Memo Stock pending, or sold − purchased for the Purchase Sold group; own stock on-hand);
- shown fields: Lot and the shared attributes, including the item note. These are uniform, because every one of them is in the key. **No Stock ID and no Stock ID count** (D9);
- `ref` = the newest source document, plus `refCount`;
- price and amount: Memo Stock only (uniform by the key), amount = Σ per-row pending amount.

Search (lot, stone, stone code, cer no, ref doc no; **not Stock ID**, Q-LOT-10a) and date filters select a group when **any** of its rows matches; the quantities always cover the whole group. The order is (newest ref date in the group DESC, `lot_key` DESC), with the opaque keyset cursor `base64url(date|lotKey)`. `lot_key` is unique and ordered across both stocks, so the D16 master merge with inventory keeps one cursor.

Pickers that change:

| Picker | Who uses it |
|---|---|
| Add Memo Stock | Memo Return |
| Add From Stock | Quotation, Reserve, Memo Out, Sale |
| Purchase › Add Memo Stock (Sold / In stock) | Purchase |

Pickers that list **lines of another document** show Lot and details in place of the Stock ID, one row per source line: Sale › From Reserve, and Memo Out Return › Memo Outstanding. These pickers are unchanged: Purchase Order, Load to Stock › From Purchase, and Memo Receive (no picker).

**D4 — Lot lines.** A new stock line names `lot_key` (with `source` `STOCK` | `OWN_STOCK`) instead of a single item. It stores:

- the group's attribute snapshot;
- `stock_count`;
- the available quantity as `stock_pending_*`.

Each line has its own pcs/weight (pcs or weight > 0, each ≤ group available; Sale Price/price rules unchanged). One group appears at most once per document, by a partial unique index (document, source, lot_key). Drafts hold nothing, as today.

**D5 — Allocation at apply, FIFO (owner Q-LOT-06 2026-11-20 "ตัด Stock ID แบบของเก่าออกก่อน"; Q-LOT-07 default).** When a document is applied (Approve, or Save/Edit/Delete of an auto-approved document, ADR-0050), the owning service allocates each lot line to Stock IDs. Candidates are the group's rows with quantity in the source bucket, ordered **oldest first (ref date ASC, Stock ID ASC)**. Each row takes `min(row available, remaining)` for pcs and for weight separately, in the same order, until both are met. If the request is still not met, the line is short and the whole operation fails (`<DOC>_PENDING_SHORT` / `STOCK_LOT_SHORT`, details per line).

The allocation is stored in a per-document child table `<document>_line_alloc`: line, seq, Stock ID ref and snapshot, pcs, weight, settled, part. The existing per-row bucket SQL then runs over the allocation, so every CHECK and report stays unchanged.

The other operations follow fixed rules:

- **Decreasing or removing** a line on an applied edit releases its unsettled allocation **newest seq first**.
- **Downstream settlement** (Memo Out Return of a Memo Out line, Sale of a Reserve line) consumes the source line's allocation **oldest seq first**. It records which rows it settled, so it can be reversed exactly.
- **Purchase.** A lot `SOLD` / `IN_STOCK` / `MERGED` line keeps ADR-0043: the sold-open part is allocated FIFO over rows with sold > purchased, and the pending part FIFO over rows with pending > 0.

**D6 — Locking.** Allocation runs inside the owner's apply transaction. For every touched group it locks the candidate rows with **one** id-ordered `FOR NO KEY UPDATE` statement on the `lot_key` index, then re-checks and allocates. Deadlock behaviour is the same as today's id-ordered `takeFromMemoStock`.

Bounds:

- ≤ 500 candidate rows per group;
- ≤ 2,000 locked rows per transaction.

Above either bound the request gets `422 STOCK_LOT_TOO_LARGE`, and nothing is changed.

**D7 — Cross-service paths (no new direction or credential).**

- **Master documents with own-stock lots** (Reserve, Memo Out, Memo Out Return, Quotation copy). Master pre-reads the candidates through a new inventory internal read `POST /internal/v1/master/stock/lots` (≤ 200 keys, ≤ 500 rows each), allocates FIFO and sends the resulting **per-stock** hold set through the **unchanged** `PUT /internal/v1/master/stock-holds/{type}/{id}`. Inventory's lock and guard stay authoritative. If a concurrent document took the stock in between, the refusal (`STOCK_HOLD_EXCEEDS_AVAILABLE`) is mapped back to the lot line, and the user retries. Master stores the own-stock allocation rows in tx1 of the existing D19 saga.
- **Sale (inventory) consuming Memo Stock.** `PUT /internal/v1/inventory/sale-consumptions/{saleId}` accepts `lotKey` in place of `memoStockId` (contract v2, additive) and still accepts `reserveLineId`. Master allocates or settles under its lock and returns the per-stock allocation in the stored result. Inventory copies it into `inventory.sale_line_alloc` in its tx1. `partner.sale_consumption_line` becomes one row per (sale, line, memo stock).
- **Future Sale own stock** (ADR-0054 D11) allocates locally with the same D5 rules.

**D8 — Existing data (owner Q-LOT-09, 2026-11-20: "เอกสารเดิมไม่แปลง").** Existing lines keep their `memo_stock_id` / `own_stock_id`. They behave as groups of one, and they are **displayed by their Lot and details, without the Stock ID** (D9). A legacy line with an empty lot shows "—" in the Lot column, followed by its details. The migration backfills one allocation row per **applied** legacy stock line (settled = the line's returned/sold), so downstream code has one path. Draft and pending legacy lines stay as they are; at apply they are allocated as a group of one. No document, number or quantity changes.

**D9 — Stock ID is not shown in the UI (owner Q-LOT-10, 2026-11-20: "Stock ID จะไม่โชว์เลย").**

- **Not shown.** No Stock ID, Stock ID count, popover or allocation list appears in pickers, item tables, row panels, the Approve Center preview, document previews or prints. Public picker and document APIs stop returning Stock IDs and allocations (only `lotKey` and details), so the browser cannot leak them.
- **Not searchable** (owner-confirmed 2026-11-20, Q-LOT-10a). Search covers lot, stone, stone code, cer no. and source doc no. This includes the Approve Center search that ADR-0051 §5 mentioned.
- **Kept server-side for audit.** Allocation rows and the Stock ID snapshots stay in the database and in the server-to-server results (Sale consumption). Stock ID is still issued, unique and never reused (ADR-0034 D3, ADR-0052 D5). It remains the ledger key for buckets, holds, movements and later barcodes.
- **Groups of one** (empty lot, or cer no.) are told apart by their details, cer no. and source document. Two identical rows without a lot can look the same; they stay separate rows (key `MS`/`OS` + id).
- **Pages that create Stock IDs and reports are owner questions** (they change today's behaviour):
  - Q-LOT-17 (default accepted 2026-11-20: hide; show Lot; the server still issues IDs): Memo Receive and Load to Stock;
  - Q-LOT-18: Memo Outstanding › Vendor table and print, the Load to Stock row panel and source table.

  Both are now unblocked (BE-LOT-012, FE-LOT-009).

**D10 — Ownership and boundaries unchanged.** Master writes `partner.*`, inventory writes `inventory.*`; there is no cross-schema write or read and no shared transaction. The modules of `backend-api-inventory` keep their boundaries (ADR-0052 D1). No gateway, container, network, secret, volume or package is added. There is no infra or devops change.

Diagrams: [sequence](../apps/backend/shared/lot-based-stock/sequence-diagram.md), [database](../apps/backend/shared/lot-based-stock/database-diagram.md). [tech-stack](tech-stack.md) is unchanged.

## Alternatives

| Alternative | Why not chosen |
|---|---|
| **Physically merge stock rows into one lot row** (add quantity to an existing open row at Memo Receive / Load approval) | Loses per-receive price, due date, vendor history and the Stock ID per line. It breaks Memo Outstanding › Vendor and Purchase Outstanding (per receive line), Load "used", photos and barcodes. It would need a rewrite of every bucket and report. Merging belongs to the later Merge/Split module. |
| **Frontend-only grouping** (picker groups rows, then sends one line per Stock ID) | The documents would still show and print one line per Stock ID. The FIFO choice would run in the browser on stale data. Each edit would mean re-splitting lines. The owner asked that deduction itself be by lot. |
| **Proportional allocation** across the group | Gives fractional pcs, and is not repeatable on a re-drive. |
| **User chooses Stock IDs inside the lot** | Undoes the request. It can be added later as an "expand" option. |
| **One polymorphic allocation table** (`document_type`, `line_id`, no line FK) | One allocator, but no FK or cascade to the line. Per-document tables of the same shape keep FK integrity, and one shared SQL builder (fixed table map, never input) serves all of them. |
| **A shorter key** (lot + colour + size only, weighted average price) | Rejected by the owner (Q-LOT-04: every detail must match). |
| **Keep Stock ID as a secondary label** (SA rev 1 draft) | Rejected by the owner (Q-LOT-10: not shown at all). |
| **Convert existing documents to lot lines** | It rewrites approved documents and their history for no stock effect. Offered as Q-LOT-09. |

## Consequences and capacity

**Master, additive migration:**

- `memo_stock.lot_key` (generated, stored; the small table is rewritten once) and two partial indexes.
- `lot_key` and `stock_count` on `quotation_line`, `reserve_line`, `memo_out_line`, `memo_return_line` and `purchase_line`. `memo_return_line.memo_stock_id` and `stock_id` become nullable. The stock-reference CHECKs are widened to "item id or lot_key". There is a unique key per (document, source, lot_key).
- Five allocation tables: `reserve_line_alloc`, `memo_out_line_alloc`, `memo_return_line_alloc`, `purchase_line_alloc`, `memo_out_return_line_alloc`.
- `sale_consumption_line` primary key becomes (sale_id, line_id, memo_stock_id).
- Backfill per D8.

**Inventory, additive migration:**

- `stock.lot_key` and a partial index;
- `sale_line.lot_key` and `stock_count` (`memo_stock_id` becomes nullable);
- `sale_line_alloc`.

**Rollback.** Before the first applied lot line: drop the new objects. After it: forward-fix only, because a lot line has no single item.

**Compatibility.** New master tRPC procedures run alongside the old ones (`memoStock.lots`, `purchase.memoStockLots`, `fromStock.lots`). The old procedures stay until the frontend switches, then they are removed in the same branch. The internal APIs take additive v2 fields.

**Capacity (4 GB / 2 vCPU, ADR-0024).**

- Unchanged: containers, limits, pools and Compose total (1.75 vCPU / 2880 MiB).
- A picker page = 2 statements: matching keys, then the aggregate over ≤ 51 groups. fromStock adds the existing single inventory call.
- An apply locks ≤ 2,000 rows in one statement and writes allocations with one bulk insert per table. Statements per apply stay ≤ 2× today.
- Expected data: thousands of stock rows a year; groups ≤ 500 rows.
- **Measure before claiming fit:** picker p95 with 20,000 available rows / 5,000 groups, and an apply of 200 lines × 10 rows (BE-LOT-011).

**Risks:**

- Free-text lot typos make separate groups. Lot is trimmed and case-insensitive only.
- The full-detail key, including item note and every price field, splits lots that differ only by a note, a discount or a cost. This is expected under the owner's rule, but it will produce fewer merges than the owner may expect; Q-LOT-04a/04b confirm it.
- With Stock ID hidden, users cannot tell two identical unlotted rows apart or trace a stone by its ID in the UI. Tracing needs the database or a later audit view.
- Pcs and weight allocated independently can give one row pcs and the next row weight. This is allowed by today's CHECKs and visible in the allocation.
- Own-stock pre-read races are refused, never oversold.
- Many touched documents mean a large test surface.

## Owner questions

Q-LOT-01…18 (with sub-questions 04a, 04b, 10a) and their recommended defaults are in [decisions](../apps/backend/shared/lot-based-stock/decisions.md#owner-questions-q-lot). The owner answered Q-LOT-04, 06, 09 and 10 on 2026-11-20; those answers are not approval of this bundle. Approving "with the defaults" accepts each remaining default.

## Acceptance and approval

**Observable checks** (IT-LOT-* in [testing](../apps/backend/shared/lot-based-stock/testing.md)):

- Three Memo Stock rows of one lot with the same details show as one picker row with summed pcs/weight. A certificate row, or a row with an empty lot, shows alone.
- Approving a Memo Out of 5 pcs from that lot takes the oldest rows first and stores the allocation. Memo Outstanding › Vendor per Memo Receive line shows the same totals as a per-Stock-ID pick would.
- A Memo Out Return of 2 pcs returns them from the oldest allocated rows.
- Two concurrent approvals of the same lot: one succeeds, the other is short with nothing changed.
- Own-stock lot holds race into a clean refusal.
- Legacy documents load, approve and return unchanged.
- The N+1 budgets are met.

**Covers:** this ADR; the SA revision 1 bundle `document/apps/backend/shared/lot-based-stock/**` (decisions, architecture, api-contract, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing); [main flow](../diagram/lot-based-stock-flow.md); the UI notes revision 1 and the BE-LOT / FE-LOT rows in [task/todo/lot-based-stock.md](../task/todo/lot-based-stock.md). No packages.

**Order after approval:**

1. BE-LOT-001…006 (master);
2. BE-LOT-007…009 (inventory);
3. BE-LOT-010…011 (verification and ADR amendment notes);
4. FE-LOT-001…008. BE-LOT-012 and FE-LOT-009 (hide Stock ID on Memo Receive / Load to Stock / vendor report) follow with the frontend rows.

The amended ADRs get one "Amended by ADR-0055" note each after acceptance.
