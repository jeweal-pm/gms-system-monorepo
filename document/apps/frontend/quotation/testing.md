# Testing: quotation revision 2 (From Stock), planned

| ID | Level | What |
|---|---|---|
| UT-QT-B25 | backend unit | Stock line rules on create and update:<br>• missing item → `QUOTATION_REFERENCE_INVALID` `lines.N.memoStockId`<br>• duplicate item → `duplicate`<br>• new or raised row above current pending → `exceeds_pending`<br>• unchanged saved row is not re-checked<br>• fields, location and price unit are copied; stone code is empty; source is STOCK<br>• Sale Price > 0 on stock rows<br>• typed lines unchanged |
| UT-QT-B26 | backend unit | Output: stock lines return `memoStockId`, `stockId`, `stockPendingPcs`, `stockPendingWeightCt`; typed lines return NULLs |
| GP-MT-QT2 | router | `memoStock.list` readable with `quotation:VIEW`; quotation input accepts `source: "STOCK"` with `memoStockId` and is otherwise strict |
| IT-QT-01…03 | DB integration (disposable PostgreSQL) | 1. Create, update and delete a quotation with stock rows; Memo Stock buckets unchanged.<br>2. CHECK `quotation_line_stock_check` and unique (quotation, item) hold.<br>3. A Memo Out approval that lowers pending doesn't block editing the note on a saved quotation. |
| Shared-module tests | backend unit | Existing Memo Out / Reserve tests pass unchanged after the helper extraction |
| UT-QT-09 | frontend unit | From Stock enabled when editable; picker rows → stock lines (full pending, empty Sale Price, read-only fields) |
| UT-QT-10 | frontend unit | Schema: stock row ≤ picked pending, > 0, Sale Price required; typed rows unchanged |
| UT-QT-11 | frontend unit | Form ↔ contract mapping for stock lines (`source`, `memoStockId`) and the saved-detail mapping |
| UT-QT-12 | frontend unit | Error mapping: `exceeds_pending`, `duplicate` and `memoStockId` reference errors give "Row N: …" messages |
| TC-QT-FS-01 | browser (:8080) | 1. Approved Memo Receive.<br>2. Quotation › From Stock: add part of an item, plus a typed row.<br>3. Save. Memo Stock and Memo Outstanding are unchanged.<br>4. Edit and Delete. Still unchanged. |

## Load to Stock phase 2 — own stock in From Stock (Revision 3, shared picker) — 2026-11-18

Covers FE-LS-P2-01/03/04/05 (Quotation) and the shared parts of FE-LS-P2-06/07 (Reserve, Memo Out, Memo Out Return); approval owner 2026-11-18 "อนุมัติ UI rev phase 2 + SA rev 2". Tests: `frontend/test/trade-document/own-stock.integration.test.ts` (17 cases), `frontend/test/load-to-stock/form.test.ts` UT-LS-018.

| Case ID | Target | Result 2026-11-18 |
|---|---|---|
| UT-LS-P2-FE-01 | `from-stock-api.ts` input, `pickKey`, `ownStockUnavailable` | pass |
| UT-LS-P2-FE-02 | `customer-stock.ts` own row mapping, input (exactly one id), load back, picked keys, row count | pass |
| UT-LS-P2-FE-03 | Quotation `OWN_STOCK` input, "More than available", load back, Save errors incl. `INVENTORY_UNAVAILABLE` | pass |
| UT-LS-P2-FE-04 | Reserve / Memo Out / MOR save errors ("only x pcs left", 503, `_BUSY`), Approve menu 503/BUSY, `syncState` refetch + hint | pass |
| UT-LS-P2-FE-05 | Load `holders` in the in-use note and `LOAD_TO_STOCK_IN_USE` toast | pass |
| IT-LS-P2-FE-01 | `MemoStockModal fromStock`: one list, Location / Load ref, no cost, notice + Retry, picked exclusion, config mapping; Memo Return picker unchanged | pass |
| IT-LS-P2-FE-02 | `fromStock.list` GET through the real tRPC link with filter and cursor | pass |
| IT-LS-P2-FE-03 | Reserve page: "Approved · Read-only · Updating our stock…" only while SYNCING | pass |
| IT-LS-P2-FE-04 | Memo Outstanding dialog Location column (`Memo` / `BKK-01`) | pass |
| UT-LS-018 | Load Lot pre-fill, optional, ≤ 40, trimmed on input, round-trip | pass |

Full frontend suite: 125 files / 1,116 tests pass; eslint 0 errors. `tsc --noEmit` frontend: the only errors are 8 `customerName` / `vendorName` reads on daybook list rows, caused by the backend `document-engine.ts` list type (conditional `syncState` spread drops the computed party-name key) — backend fix needed, not a frontend change.

Live (not run; services not running locally): picker with both sources, inventory stopped (notice + Memo rows pickable), Quotation/Reserve/Memo Out Save with our stock above available, Approve while inventory down, SYNCING hint clearing, MOR of an our-stock line. Security reviews and manual-tester: pending (parent).
