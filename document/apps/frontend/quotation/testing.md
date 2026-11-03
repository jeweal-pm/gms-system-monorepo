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
