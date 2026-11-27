# Error handling: stock-adjustment (UI revision 1, approved 2026-11-24)

Codes come from the [backend error-handling](../../backend/inventory/stock-adjustment/error-handling.md).

| Case | UI |
|---|---|
| No Main Location when pressing From Stock / barcode / empty row | Toast "Choose Main Location first"; focus I-02 |
| Physical Pcs/Cts missing on a picked row | Field error on the row, Save blocked |
| `409 STOCK_ADJUSTMENT_STOCK_CHANGED {lines:[{lineId, onHandPcs, onHandWeightCt}]}` | Row error "Stock changed since picked (now X pcs / Y cts). Remove and pick again."; edits kept |
| `409 STOCK_ADJUSTMENT_IN_USE {stockIds}` | Toast "Cannot edit or delete: these stones were used by a later document" |
| `409 VERSION_CONFLICT` | Toast "This document was changed by someone else. Refresh." |
| `422 STOCK_ADJUSTMENT_LINE_UNAVAILABLE {lineIds}` | Row error "No longer in stock at this location" |
| `403` | No-permission text as other pages |
| `404 STOCK_ADJUSTMENT_NOT_FOUND` | Not-found state |
| Network / 5xx | Generic toast; form is kept |
