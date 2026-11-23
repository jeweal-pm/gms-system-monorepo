# 2026-11-21 — Lot-based stock, frontend round 2 (FE-LOT-002…008)

- Memo Return "Add Memo Stock" lists the vendor's lots (`memoStock.lots`); a row is a lot with its weighted-average price. Rows, table, view and errors show the Lot, never a Stock ID.
- Purchase "Add Memo Stock" lists lots per part (`purchase.memoStockLots`: Sold first, then In stock); the Merge question pairs the Sold and In-stock rows of the same lot. Table, row panel and merge dialog show the Lot; the grey tag under it reads Sold / In stock / Sold + In stock or "from PO No.".
- Sale "Add From Stock" uses the shared lot picker with Memo Stock lots only and saves `lotKey`. Sale, Memo Out Return and Memo Outstanding still show the Stock ID (owner Q3); a Sale lot line has none.
- Save payloads of Purchase and Memo Return send `lotKey` alone; legacy lines keep their item id. Error texts name the row and lot (short, nothing left, vendor / currency mismatch, too large).
- Approve Center: preview code column and search text use the Lot for Quotation, Reserve, Memo Out, Purchase and Memo Return.
- No frontend call to `fromStock.list`, `purchase.memoStock` or `memoStock.list` remains (FE-LOT-008). Open for backend: turn `ACCEPT_NEW_ITEM_REFERENCES` off and remove the old procedures.
- FE-LOT-009 withdrawn by the owner. No package changes. Tests: full frontend suite, typecheck and eslint pass.
