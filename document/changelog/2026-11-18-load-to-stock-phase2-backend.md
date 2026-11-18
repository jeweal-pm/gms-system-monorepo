# 2026-11-18 — Load to Stock phase 2 backend (BE-LS-P2-01…09)

Approval: owner 2026-11-18 "อนุมัติ UI rev phase 2 + SA rev 2" (ADR-0052 Amendment 2 D16–D23, SA revision 2). Branch `feat/18-11-26-load-phase2`, uncommitted.

## backend-api-inventory
- Migration `20261118100000_stock_holds_phase2`: `stock.ref_doc_date/ref_doc_no` (backfilled), `stock_picker_idx` (replaces `stock_available_idx`), `stock_hold` re-keyed per (type, document, stock) with `document_no`, kind↔type and non-zero CHECKs, new `stock_hold_document`, hold movement kinds, grants.
- Internal API `/internal/v1/master/*` (`src/internal/master-routes.ts`): `POST stock/available`, `POST stock/batch`, `PUT|GET stock-holds/{type}/{id}`; `MASTER_INVENTORY_SERVICE_TOKEN_FILE` bearer (constant time, the inventory → master token refused), ≤ 4 in flight (`503 INVENTORY_BUSY`), 64 KiB strict bodies.
- `modules/stock/holds.ts` (`applyHolds`, 7 statements for 200 stocks), `modules/stock/picker.ts`; `createStocks` / `applyStockEdit` keep `ref_doc_*`; load detail and `LOAD_TO_STOCK_IN_USE` carry `holders`.
- D23 Lot: `attrs.lot` optional (defaults to ""), trimmed, ≤ 40; synced on applied edit; in the picker and `q`.

## backend-api-master
- Migration `20261118100000_own_stock_lines`: `own_stock_id` + `OWN_STOCK` on quotation / reserve / memo-out lines, extended stock CHECKs, unique + index, `memo_out_line_open_idx` recreated, `sync_state` / `hold_revision` on reserve / memo_out / memo_out_return, `inventory_sync_op`.
- `inventory-client/` (≤ 4 sockets, 2 s / 5 s, BUSY retry once), 60 s sweep provider `InventorySyncSweep` (registered in `app.module.ts`), operator script `inventory-sync:redrive` (package.json script).
- tRPC `fromStock.list` (one merged list, `ownStock: "OK" | "UNAVAILABLE"`); Quotation own-stock copy (2a); Reserve / Memo Out / Memo Out Return hold saga (2b) with fast path for Memo-Stock-only documents; `syncState` on list rows and detail; Memo Outstanding (picker + customer report) include own-stock lines with `source` / `location`; new codes `INVENTORY_UNAVAILABLE`, `RESERVE_BUSY`, `MEMO_OUT_BUSY`, `MEMO_OUT_RETURN_BUSY`; `FieldError.params`.

Evidence: [testing.md "Results — phase 2"](../apps/backend/inventory/load-to-stock/testing.md#results--phase-2-backend-be-ls-p2-0109-2026-11-18).
