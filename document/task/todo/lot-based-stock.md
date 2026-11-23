# TODO: lot-based-stock (pick and deduct stock by Lot)

- feature-id: `lot-based-stock`
- revision: 1 (UI notes revision 1 in this file + SA revision 1)
- source-ui-revision (backend items): UI notes 1 (this file, [§ UI notes](#ui-notes-ui-revision-1))
- status: **approved** 2026-11-20, in progress
- request: owner 2026-11-20, verbatim: "ถ้าต้องการเปลี่ยนจากการตัดผ่าน stock id ให้กลายเป็น lot แทน ของจาก lot เดียวกัน หากเป็นสีเดียวกันขนาด detail เหมือนกันให้รวมจำนวนกันเลย ให้ sa เขียน spec และแก้ไข modal ที่ใช้เป็น stock id เป็น lot แทน" (pick and deduct by Lot instead of Stock ID; items of the same lot with the same colour, size and details merge into one entry with summed quantity; SA writes the spec; the Stock ID modals change to Lot after approval)
- source: owner text only (no image / Figma). The visual reference is the shipped picker kit (`frontend/src/features/trade-document/picker-ui.tsx`, commit b1036dc "unify picker UI").
- ui-spec: not run. The UI change is limited to columns, keys and text in existing shared pickers and item tables, so SA wrote it as [UI notes](#ui-notes-ui-revision-1) below. After Q-LOT-10 (Stock ID hidden) there is no popover or allocation list left to design, so `ui-spec` is not needed.
- dependencies: none new ([dependencies](../../apps/backend/shared/lot-based-stock/dependencies.md))
- backend-bundles: [shared/lot-based-stock SA rev 1](../../apps/backend/shared/lot-based-stock/decisions.md) ([architecture](../../apps/backend/shared/lot-based-stock/architecture.md), [api-contract](../../apps/backend/shared/lot-based-stock/api-contract.md), [authorization](../../apps/backend/shared/lot-based-stock/authorization.md), [database-diagram](../../apps/backend/shared/lot-based-stock/database-diagram.md), [sequence-diagram](../../apps/backend/shared/lot-based-stock/sequence-diagram.md), [error-handling](../../apps/backend/shared/lot-based-stock/error-handling.md), [dependencies](../../apps/backend/shared/lot-based-stock/dependencies.md), [testing](../../apps/backend/shared/lot-based-stock/testing.md)); [ADR-0055](../../adr/0055-lot-based-stock-picking-and-allocation.md) **Proposed**; flow [lot-based-stock-flow](../../diagram/lot-based-stock-flow.md)
- approved-revision: UI notes 1
- approved-by: owner
- approved-at: 2026-11-20
- approval-evidence: owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print); start ordered 2026-11-20 "ต่อเรื่อง Lot ได้เลย"
- sa-approved-revision: SA 1 (ADR-0055 Accepted)
- sa-approved-by: owner
- sa-approved-at: 2026-11-20
- sa-approval-evidence: owner "อนุมัติ lot-based-stock rev 1 (ค่า default)" in chat, 2026-11-20 (UI notes rev 1 + SA rev 1 + ADR-0055; Q-LOT-04/04a/06/09/10/10a as answered; remaining defaults incl. Q-LOT-04b all price fields, Q-LOT-17 hide Stock ID on Memo Receive and Load to Stock, Q-LOT-18 hide it in Memo Outstanding › Vendor and print); start ordered 2026-11-20 "ต่อเรื่อง Lot ได้เลย"
- review-bundle: this TODO (UI notes + rows), the SA bundle above, ADR-0055, owner questions Q-LOT-01…16 in [decisions](../../apps/backend/shared/lot-based-stock/decisions.md#owner-questions-q-lot)
- related ADRs: [ADR-0034](../../adr/0034-memo-receive-approval-and-memo-stock.md), [ADR-0035](../../adr/0035-memo-outstanding-vendor-report.md), [ADR-0036](../../adr/0036-reserve-document.md), [ADR-0038](../../adr/0038-quotation-from-stock.md), [ADR-0042](../../adr/0042-purchase-document-and-stock-deduction.md), [ADR-0043](../../adr/0043-purchase-merged-memo-stock-line.md), [ADR-0050](../../adr/0050-approval-setting-draft-send-to-approve.md), [ADR-0051](../../adr/0051-purchase-lines-without-stock-id.md), [ADR-0052](../../adr/0052-load-to-stock-in-backend-api-inventory.md), [ADR-0054](../../adr/0054-sale-document.md)
- infra / devops: none required (no container, image, route, secret, network, volume or build-context change)

## What the owner approves

One approval covers:

- UI notes revision 1;
- SA revision 1 (the whole `document/apps/backend/shared/lot-based-stock/**` bundle and the flow);
- ADR-0055;
- the owner's answers of 2026-11-20 (Q-LOT-04, 06, 09, 10, below) and the defaults of the remaining Q-LOT-01…18 / 04a / 04b / 10a, unless the owner answers otherwise.

A reply such as "อนุมัติ lot-based-stock rev 1 (ค่า default)" approves the whole bundle. Changing a Q-LOT answer that alters the key, the allocation rule or the scope makes SA update the affected documents before implementation.

### Owner answers 2026-11-20 (not approval of the bundle)

The answers, verbatim: "Q-LOT-04: จะรวม lot ได้ถ้าหากของอันนั้น detail เหมือนกันทุกทุกช่อง / Q-LOT-06: ตัด Stock ID แบบของเก่าออกก่อน / Q-LOT-09: เอกสารเดิมไม่แปลง / Q-LOT-10: Stock ID จะไม่โชว์เลย". They are applied throughout this bundle:

- **Q-LOT-04:** merge only when every detail is identical. The owner confirmed on 2026-11-20 that the item note counts as a detail (Q-LOT-04a): items with different notes are not merged, and document-level data (source doc no., dates, Stock ID) is not in the key. Still to confirm: every price field counts too (Q-LOT-04b, default yes).
- **Q-LOT-06:** the oldest stock is taken first.
- **Q-LOT-09:** existing documents are not converted.
- **Q-LOT-10:** the Stock ID is shown nowhere. Open sub-questions:
  - Q-LOT-10a: is it searchable? **Owner-confirmed 2026-11-20: no.** Allocations stay stored on the server for audit, and existing documents show their Lot instead.
  - Q-LOT-17 (**open**): hide it on Memo Receive and Load to Stock too? Default: hide; this changes behaviour, so the owner must confirm.
  - Q-LOT-18 (**open**): hide it in the Memo Outstanding › Vendor report and its print view? Default: hide.

## UI notes (UI revision 1)

These apply to the existing picker kit. Layout, sizes, colours, toolbar, footer and "Load more" stay unchanged. Lot is the badge `PickerLot`. **No Stock ID appears anywhere in the UI (owner Q-LOT-10):** no column, sub-label, count, popover, tooltip, allocation list, checkbox label, search hint, preview or print.

### Lot cell (shared, new `LotCell` in `trade-document/picker-ui.tsx`)

- Line 1: the **Lot** badge, then the Stone Code in bold. Without a lot (a group of one, or a legacy line with an empty lot), the cell shows "—" followed by the Stone Code.
- Line 2: the details, as today's columns (Stone, Shape · Size, …).
- Line 3: the item note. It is uniform, because it is part of the merge key (Q-LOT-04a, owner-confirmed).
- Checkbox label: "Select lot {lot} {stone code}". Without a lot: "Select {stone code} from {ref doc no}".
- Two identical items without a lot can appear as two rows that look the same. This is accepted (Q-LOT-10); the Ref. column usually tells them apart.

### Pickers

| Picker (component) | Used by | Change |
|---|---|---|
| Add Memo Stock (`MemoStockModal`, Memo Return mode) | Memo Return | Rows are lot groups (`memoStock.lots`). Column "Stone Code / Stock ID · Lot" becomes **"Lot / Stone Code"** (LotCell). Pending Pcs/Weight are the lot sums. Price is the uniform lot price; Amount is the sum. Ref. shows the newest Memo Receive + "+n". Row key is `lotKey`. Search placeholder: "Search Lot, Stone, Stone Code, Cer No." (no Stock ID, Q-LOT-10a) |
| Add From Stock (`MemoStockModal`, fromStock mode) | Quotation, Reserve, Memo Out (`customer-stock-config.tsx`), Sale (`SalePage.tsx`) | Same as above with `fromStock.lots`. Memo Stock and Our stock lots are separate rows (Location tells them apart). The "Our stock is unavailable — Retry" notice is unchanged. |
| Purchase › Add Memo Stock (`MemoStockPicker` in `purchase-pickers.tsx`) | Purchase | Rows are lots in the Sold / In stock groups (`purchase.memoStockLots`). The Sold row shows sold-open pcs/weight of the lot. The "Merge?" question (ADR-0043) pairs the Sold and In-stock rows of the **same lot**. |
| Add From Reserve (`ReserveLinePicker` in `sale-pickers.tsx`) | Sale | Still one row per Reserve line. "Stone Code / Stock ID · Lot" becomes **"Lot / Stone Code"** (LotCell), including legacy lines. Search placeholder drops Stock ID. |
| Memo Outstanding (`MemoOutstandingModal`) | Memo Out Return | Still one row per Memo Out line. Column "Stock ID / Lot" becomes **"Lot / Stone Code"** (LotCell), including legacy lines. Search placeholder drops Stock ID. |
| Add Purchase Order (`PurchaseOrderPicker`) | Purchase | **No change** (no Stock ID shown). |
| Add From Purchase (`PurchaseLinePicker`) | Load to Stock | Sub-label "Stock ID · Lot" ("New on load") becomes Lot only **if Q-LOT-17 = hide** (FE-LOT-009). |

### Item tables, row panels, previews

- The Stock ID column in the trade-document item tables becomes **"Lot"** (lot badge, or "—"). This covers:
  - `quotation/components/items/ItemTable.tsx`, `ItemEditorPanel.tsx` and `ItemPhotoBox.tsx`;
  - `quotation/document-kind.tsx` and `trade-document/return-item-table.tsx`;
  - `purchase/components/PurchasePage.tsx` and `merge-dialog.tsx`;
  - `sale/components/SalePage.tsx`;
  - the Approve Center preview (`approve-center/preview.ts`, `inventory.ts`) and its search.
- Legacy lines (saved before the change, not converted, Q-LOT-09) are shown the same way, by Lot and details, **without** their Stock ID.
- Row panels show no allocation list. The allocation is kept only on the server, for audit.
- The pcs/weight limit hint uses the lot's available quantity: "Max x pcs / y ct in lot L".
- Short errors on Save/Approve show on the row: "Row n: only x pcs / y ct left in lot L". A race on our stock shows: "Row n: lot L changed, refresh and try again".
- **Memo Receive and Load to Stock** (`memo-receive/components/MemoReceiveForm.tsx`, `load-to-stock/components/{cells,load-table,load-row-panel,load-source-table,load-mode-dialog,purchase-line-picker}.tsx`): if Q-LOT-17 = hide (the default), the Stock ID column and labels ("Auto", the issued ID, "New on load") are removed and Lot is shown instead. The server still issues IDs. **Blocked until the owner answers Q-LOT-17** (FE-LOT-009).
- **Memo Outstanding › Vendor** (`memo-outstanding-vendor/components/{outstanding-table,print-view}.tsx`): if Q-LOT-18 = hide (the default), the Stock ID column is removed from the table and the print. Rows stay per item, identified by Lot and details (FE-LOT-009).

## Implementation items (all wait for owner approval)

Order: master (BE-LOT-001…006) → inventory (BE-LOT-007…009) → verification (BE-LOT-010…011) → frontend (FE-LOT-001…008). Backend owns the migrations. Shared manifests and Docker files are not touched.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-LOT-001 | backend | Master migration: `memo_stock.lot_key` generated column + 2 indexes; line columns `lot_key`/`stock_count` (quotation, reserve, memo_out, memo_return, purchase lines); widened CHECKs/nullability; 5 `<doc>_line_alloc` tables; `sale_consumption_line` re-key; backfill + in-migration verification | `backend-api-master/prisma/schema.prisma`, `backend-api-master/prisma/migrations/<ts>_lot_based_stock/**` | owner approval (SA rev 1) | [database-diagram](../../apps/backend/shared/lot-based-stock/database-diagram.md) exactly; down script; reconciliation = 0 rows on dev | IT-LOT-01, IT-LOT-11, IT-LOT-12 |
| [x] | BE-LOT-002 | backend | `lot-key.ts`, `lot-allocation.ts` (pure), `lot-apply.ts` (lock, alloc writes over a fixed table map, bucket SQL from allocations) | `backend-api-master/src/trade-document/{lot-key,lot-allocation,lot-apply}.ts`, `memo-stock.service.ts`, tests | BE-LOT-001 | FIFO / release / settle rules; one lock statement; bounds 500 / 2,000 | UT-LOT-01…05, IT-LOT-04, IT-LOT-10 |
| [x] | BE-LOT-003 | backend | Lot pickers: `memoStock.lots`, `purchase.memoStockLots`, `fromStock.lots` (merge with the inventory lots read); `sale` VIEW on `fromStock.lots`; `memoOutstanding` + internal `sale/reserve-lines` add lot fields | `backend-api-master/src/trade-document/{lot-stock.service,from-stock.service,memo-outstanding.service}.ts`, `src/purchase/purchase-pickers.ts`, `src/master/router.ts`, `src/inventory-internal/sale-reads.ts`, `src/inventory-client/**`, tests | BE-LOT-001, BE-LOT-008 (for fromStock merge; Memo-only path testable earlier) | [api-contract](../../apps/backend/shared/lot-based-stock/api-contract.md) shapes; ≤ 2 statements per side; inventory down → UNAVAILABLE | IT-LOT-02 |
| [x] | BE-LOT-004 | backend | Documents: lot lines on save/get for Quotation, Reserve, Memo Out, Memo Return, Purchase (SOLD/IN_STOCK/MERGED); allocation at apply; release/settle on edit/delete; Memo Out Return settle; `latestStockUser` over alloc tables; legacy line rule (`lot_required`) | `backend-api-master/src/trade-document/**`, `src/purchase/**`, tests | BE-LOT-002 | Per-document behaviour table in [decisions](../../apps/backend/shared/lot-based-stock/decisions.md#per-document-behaviour); existing suites still pass | IT-LOT-03…09, IT-LOT-13, IT-LOT-14 |
| [x] | BE-LOT-005 | backend | Own-stock lots in master documents: pre-read `stock/lots`, allocate, H_new per stock into the existing D19 saga, refusal mapping, own alloc rows in tx1 | `backend-api-master/src/trade-document/{inventory-hold-saga,own-stock-lines}.ts`, `src/inventory-client/**`, tests | BE-LOT-004, BE-LOT-008 | Hold API unchanged; race → line error, nothing held | IT-LOT-I02, IT-LOT-I03 |
| [x] | BE-LOT-006 | backend | Internal Sale consumption v2 (`lotKey`, reserve allocation settle, `allocations` in result), `sale/prepare` lot references | `backend-api-master/src/inventory-internal/**`, tests | BE-LOT-002 | v1 still accepted for legacy lines; replay deterministic | IT-LOT-I04, IT-LOT-I05 |
| [x] | BE-LOT-007 | backend | Inventory migration: `stock.lot_key` + `stock_lot_open_idx`; `sale_line.lot_key/stock_count`, `memo_stock_id` nullable; `sale_line_alloc` + backfill | `backend-api-inventory/prisma/schema.prisma`, `backend-api-inventory/prisma/migrations/<ts>_lot_based_stock/**` | owner approval | database-diagram; down script | IT-LOT-I06 |
| [x] | BE-LOT-008 | backend | Inventory internal reads `POST /internal/v1/master/stock/lots/available` and `/stock/lots` (no cost; ≤ 200 keys; ≤ 500 rows; ≤ 4 in flight) | `backend-api-inventory/src/modules/load-to-stock/**` or `src/platform/stock/**` (stock module), `src/app.ts` route registration, tests | BE-LOT-007 | contract shapes; guard + token unchanged | IT-LOT-I01 |
| [x] | BE-LOT-009 | backend | Inventory Sale: lot STOCK lines (save/get), v2 consumption request, `sale_line_alloc` from the result in tx1 | `backend-api-inventory/src/modules/sale/**`, tests | BE-LOT-006, BE-LOT-007 | kill-between-steps recovery; legacy sales unchanged | IT-LOT-I04, IT-LOT-I05 |
| [x] | BE-LOT-012 | backend | Q-LOT-17 / Q-LOT-18 = hide (owner default 2026-11-20). If hide: drop `stockId` from public Memo Receive, Load to Stock and Memo Outstanding › Vendor outputs (issuing and storage unchanged) | `backend-api-master/src/trade-document/{memo-receive,memo-outstanding}.service.ts`, `backend-api-inventory/src/modules/load-to-stock/**`, tests | owner answer Q-LOT-17/18 | IT-LOT-15 extended to these outputs | IT-LOT-15 |
| [x] | BE-LOT-010 | backend + SA (docs) | After acceptance: add the "Amended by ADR-0055" note to ADR-0034/0036/0038/0042/0043/0052/0054; set ADR-0055 Accepted with the evidence | `document/adr/**` | owner approval | notes only, no other text changes | review |
| [~] | BE-LOT-011 | backend | Verification: full master + inventory suites, statement-count assertions, capacity measurements (architecture § Capacity), security reviews (sec-auditor + security-auditor once, same revision) | tests, `document/testing/**` report | BE-LOT-001…009 | all pass; measurements recorded | testing.md |
| [x] | FE-LOT-001 | frontend | `LotCell` (Lot badge, Stone Code, details, note; no Stock ID) | `frontend/src/features/trade-document/picker-ui.tsx` (+ tests) | owner approval (UI notes 1) | UI notes § Lot cell | unit tests **Done 2026-11-21** (`LotCell`, `lotSelectLabel` in `picker-ui.tsx`; UT-LOT-FE-01). |
| [x] | FE-LOT-002 | frontend | `MemoStockModal` lot mode: `memoStock.lots` (Memo Return) and `fromStock.lots` (Quotation/Reserve/Memo Out/Sale); row key `lotKey`; picked lots hidden; `pickKey` for lots | `frontend/src/features/trade-document/{memo-stock-modal.tsx,memo-stock-api.ts,from-stock-api.ts,customer-stock-config.tsx}`, `frontend/src/features/memo-return/**`, `frontend/src/features/sale/components/SalePage.tsx`, `frontend/src/features/quotation/components/QuotationForm.tsx` (+ tests) | FE-LOT-001, BE-LOT-003 | UI notes § Pickers rows 1–2 | integration tests **Round 1 done 2026-11-21** (From Stock lots for Quotation / Reserve / Memo Out; Memo Return, Sale and the Sale picker remain, next round). IT-LS-P2-FE-01/02, UT-LOT-FE-02. **Round 2 done 2026-11-21:** Memo Return (`memoStock.lots`), Sale From Stock (`fromStock.lots`, Memo Stock lots only via `memoOnly`, `lotKey` payload; legacy `memoStockId` lines still load). `MemoStockModal` is lots-only. |
| [x] | FE-LOT-003 | frontend | Purchase `MemoStockPicker` lot rows (Sold / In stock), Merge question per lot | `frontend/src/features/purchase/**` (+ tests) | FE-LOT-001, BE-LOT-003 | UI notes row 3; ADR-0043 behaviour per lot | integration tests **Done 2026-11-21** (`purchase.memoStockLots`, Sold / In stock rows per lot, Merge question per lot, `lotKey` payload; UT-PU-12…16, UT-PU-07/08). |
| [x] | FE-LOT-004 | frontend | Sale `ReserveLinePicker` Lot cell instead of Stock ID (incl. legacy lines), search without Stock ID | `frontend/src/features/sale/components/sale-pickers.tsx` (+ tests) | FE-LOT-001, BE-LOT-003 | UI notes row 4 | integration tests **Done 2026-11-21 as scope change:** owner Q3 shows the Stock ID again in Sale, so no Lot cell; only type tolerance (`memoStockId` / `stockId` nullable, `lotKey`, `allocated` on the Sale line schema). |
| [x] | FE-LOT-005 | frontend | Memo Out Return `MemoOutstandingModal` Lot cell instead of Stock ID (incl. legacy lines), search without Stock ID | `frontend/src/features/memo-out-return/components/MemoOutstandingModal.tsx` (+ tests) | FE-LOT-001, BE-LOT-003 | UI notes row 5 | integration tests **Done 2026-11-21 as scope change:** owner Q3 keeps the Stock ID in Memo Out Return / Memo Outstanding; no frontend change (picks by `memoOutLineId`, no `lotKey` needed). |
| [x] | FE-LOT-006 | frontend | Item tables / row panels / previews / Approve Center search: Stock ID column becomes Lot for new and legacy lines; no allocation list; stop reading `stockId` | `frontend/src/features/quotation/components/items/{ItemTable,ItemEditorPanel}.tsx`, `quotation/document-kind.tsx`, `trade-document/return-item-table.tsx`, `quotation/components/items/ItemPhotoBox.tsx`, `purchase/components/{PurchasePage,merge-dialog}.tsx`, `approve-center/{preview,inventory}.ts`, `sale/components/SalePage.tsx` (+ tests) | FE-LOT-001, BE-LOT-004 | UI notes § Item tables | integration tests **Round 1 done 2026-11-21** for Quotation / Reserve / Memo Out item table, row panel and Approve Center preview (UT-LOT-FE-03/04/10). Purchase, Sale, `return-item-table` remain. Print: no print view exists yet. **Round 2 done 2026-11-21:** Purchase (table, panel, merge dialog, preview) and Memo Return (return table, preview). Sale and Memo Out Return keep the Stock ID (Q3). |
| [x] | FE-LOT-007 | frontend | Save payloads send `lotKey`; error mapping (`lot_required`, `STOCK_LOT_UNAVAILABLE`, `STOCK_LOT_TOO_LARGE`, short details per lot) | `frontend/src/features/trade-document/{customer-stock,stock-row-errors,document-api}.ts*`, per-document form adapters (+ tests) | BE-LOT-004/006/009 | [error-handling](../../apps/backend/shared/lot-based-stock/error-handling.md) UI texts | integration tests **Round 1 done 2026-11-21** for Quotation / Reserve / Memo Out (`lotKey` payload; UT-LOT-FE-05, UT-QT-12, UT-MO-204b). Memo Return, Purchase, Sale, Memo Out Return remain. **Round 2 done 2026-11-21:** Purchase and Memo Return `lotKey` payloads and row errors (UT-LOT-FE-11, UT-MRT-06b). Sale maps `STOCK_LOT_*`. |
| [x] | FE-LOT-008 | frontend | Remove the picker use of `fromStock.list` / `purchase.memoStock` / `memoStock.list`; full frontend suite; security reviews with BE-LOT-011 | frontend files above | FE-LOT-002…007 | no old procedure calls from pickers; suites pass | test run **Frontend part done 2026-11-21:** no `fromStock.list` / `purchase.memoStock` / `memoStock.list` calls remain (queries and invalidations moved to `.lots`). Open for **backend:** switch `ACCEPT_NEW_ITEM_REFERENCES` off in `lot-key.ts` (frontend sends only `lotKey` for new picks) and remove the old procedures. |
| [x] | FE-LOT-009 | frontend | Q-LOT-17 / Q-LOT-18 = hide (owner default 2026-11-20). Hide Stock ID on Memo Receive and Load to Stock (column, "Auto", issued ID, "New on load", row panel, source table, mode dialog) and in Memo Outstanding › Vendor table + print; show Lot instead | `frontend/src/features/memo-receive/**`, `frontend/src/features/load-to-stock/**`, `frontend/src/features/memo-outstanding-vendor/**` (+ tests) | owner answer Q-LOT-17/18; BE-LOT-012 | UI notes § Item tables (last two bullets); no Stock ID rendered | integration tests + DOM assertion **Withdrawn** by the owner (2026-11-21, Q3): Memo Receive, Load to Stock and Memo Outstanding keep the Stock ID. |

## Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-11-20 | Initial SA bundle + UI notes; pending-review |
| 1 (update 2) | 2026-11-20 | Owner follow-up confirms Q-LOT-04a (the item note is in the key; document-level data is excluded) and Q-LOT-10a (Stock ID not searchable; allocations stored for audit; existing documents show Lot). Q-LOT-04b, 17 and 18 are still open. Not approval. |
| 1 (frontend round 2) | 2026-11-21 | FE-LOT-002…008 done for Memo Return, Purchase and Sale From Stock; 004 / 005 / 009 reduced or withdrawn by owner Q3. See [changelog](../../changelog/2026-11-21-lot-based-stock-frontend-round2.md). |
| 1 (frontend round 1) | 2026-11-21 | FE-LOT-001 done; FE-LOT-002/006/007 done for Quotation, Reserve, Memo Out (owner scope 2026-11-21 Q1-Q4); the rest next round. See [changelog](../../changelog/2026-11-21-lot-based-stock-frontend-round1.md). |
| 1 (backend) | 2026-11-21 | BE-LOT-001…010 and 012 implemented; BE-LOT-011 tests + capacity recorded in [testing](../../apps/backend/shared/lot-based-stock/testing.md#implementation-verification-backend-2026-11-21), RSS measurement and the two security reviews still open. Deviations: see § Backend implementation notes. |
| 1 (update) | 2026-11-20 | Owner answers Q-LOT-04 (all details must match; readings Q-LOT-04a item note, 04b price fields), Q-LOT-06 (oldest first), Q-LOT-09 (no conversion), Q-LOT-10 (Stock ID not shown anywhere): merge key widened, Stock ID removed from UI, public APIs and search; new Q-LOT-10a/17/18, BE-LOT-012, FE-LOT-009. Still pending-review, not approved. |

## Owner change after approval (2026-11-20)

- From Stock order: our stock (Load to Stock) first, then Memo Stock (`fromStock.list`), owner 2026-11-20. Implemented on the current Stock ID picker; the lot pickers (BE-LOT / FE-LOT) keep this section order with Q-LOT-11 inside each section. See [decisions](../../apps/backend/shared/lot-based-stock/decisions.md).

## Owner change 2026-11-21

Owner, verbatim: "Q1: แบบ ก lot สามารถซ้ำกันได้ ต้อง detail ต้องตรงกันทุกอย่างถึงจะสามารถรวมกันได้ยกเว้น ราคา ถ้าราคา ต่างกันจะเอาสองค่ามาเฉลี่ยกัน / Q2: ทำ From Stock ของ Quotation / Reserve / Memo Out ก่อน แล้วค่อยทำ Purchase, Memo Return และ Sale เป็นรอบถัดไป / Q3: ซ่อน Stock ID เฉพาะ Quotation, Reserve, Memo Out, Purchase, Memo Return / Q4: ของจาก Load (own stock) ไม่ต้องรวม Lot ในรอบนี้". Backend done 2026-11-21 (see [decisions § Owner change 2026-11-21](../../apps/backend/shared/lot-based-stock/decisions.md#owner-change-2026-11-21)): price removed from the Memo Stock key (weighted average shown), own stock not merged (key = OS + id), Stock ID hidden only on Quotation / Reserve / Memo Out / Purchase / Memo Return, all lot procedures kept. Frontend order: FE-LOT for Quotation / Reserve / Memo Out From Stock first; Purchase (FE-LOT-003), Memo Return and Sale next round; FE-LOT-009 (hide on Memo Receive / Load / Memo Outstanding) is withdrawn.

## Backend round 2 (2026-11-21, FE-LOT-008)

- Done: `ACCEPT_NEW_ITEM_REFERENCES = false` with the `lot_required` rule wired into Quotation, Reserve, Memo Out, Memo Return and Purchase (legacy items already on the document stay accepted); `memoStock.list`, `fromStock.list`, `purchase.memoStock` and their dead code removed (see [api-contract § Compatibility](../../apps/backend/shared/lot-based-stock/api-contract.md#compatibility-and-removal)); `lotKey` / `allocated` declared on `PurchaseLineOut`; authorization.md aligned with the code (H1); release note (zero lot lines, master then inventory) and the H4 risk documented. BE-LOT-011 is marked `[~]`: tests and capacity are recorded, the inventory RSS measurement and the final auditor re-review are still open.
- Superseded below: the "Compatibility step 1" note.

## Backend implementation notes (2026-11-21)

- (Superseded by round 2) Compatibility step 1: new item references (`memoStockId` / `ownStockId` on a new line) are still accepted (`ACCEPT_NEW_ITEM_REFERENCES = true` in `lot-key.ts`) until FE-LOT-002…007 ship; `lot_required` is implemented and unit-tested and is switched on with FE-LOT-008 in the same branch.
- `stockId` is returned as `null` (not yet removed) in every public output, incl. Memo Receive / Purchase save results (`stockIds: null[]` at the tRPC boundary) and Load to Stock (`stockIds` / rows). Internal routes keep Stock IDs.
- Error code for invalid input stays the existing `VALIDATION_ERROR` envelope (the bundle text says `VALIDATION_FAILED`; "conventions are unchanged").
- Migration step 6 aborts on allocation / Reserve / Return mismatches but only WARNs on sold / purchased rows without a Sale or Purchase document (dev seed row 260005), so the dev data migrates unchanged. Needs SA/owner acknowledgement.
- `sale_consumption.result` size CHECK raised 32 KiB → 256 KiB to store allocations (≤ 2,000 rows).
- Inventory `stock/lots` also caps the whole call at 2,000 candidates (the per-apply bound).
- Own-stock lot lines are always pre-read (no "kept" shortcut for unchanged lot lines); the plan is re-derived at approve / restore.
- Purchase lot lines return `limit* / min*` as null (the range is shown from the picker row).
- Not changed (open): `LOAD_TO_STOCK_IN_USE` still lists Stock IDs in `details.stockIds` (ADR-0052 contract; not in the Q-LOT-17 list).
