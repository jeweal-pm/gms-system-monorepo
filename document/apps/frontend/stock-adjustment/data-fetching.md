# Data fetching: stock-adjustment (UI revision 1, approved 2026-11-24)

The contract is [inventory/stock-adjustment api-contract](../../backend/inventory/stock-adjustment/api-contract.md). All calls are REST under `/api/inventory/v1`, same origin, cookie auth, and CSRF on writes, as in Load to Stock.

| Hook (in `features/stock-adjustment/api.ts`) | Endpoint | Used by |
|---|---|---|
| `useAdjustmentOptions()` | `GET /stock-adjustment/options` → `{ locations, numbering }` | I-02, H-01 |
| `useNextNumber(docDate)` | `GET /stock-adjustment/next-number?docDate=` | H-01 preview |
| `useAdjustmentList(filters)` | `GET /stock-adjustment?…` | Daybook |
| `useAdjustment(id)` | `GET /stock-adjustment/{id}` | page load |
| `useStockLots(location, q, exclude)` | `GET /stock-adjustment/stock?location=&q=&exclude=&cursor=&limit=` | P-01 From Stock, P-02 barcode (`q` = scanned code) |
| mutations | `POST /stock-adjustment`, `PUT /{id}`, `POST /{id}/submit`, `/approve`, `/request-revision`, `/reject`, `/delete`, `/restore` | H-03, Approve Center |

- **From Stock data source:** the dialog component `MemoStockModal` is reused, but its rows come from the new inventory endpoint above (own stock at one location, on hand > 0), not from master `fromStock.lots`. This keeps the page on one service (ADR-0059 D9). The modal fetches internally today (`fromStock: true` → `useFromStock`), so FE-SAJ-004 adds a third prop variant `{ source: "stock-adjustment", location }` that calls `useStockLots` and maps `StockLot` to the modal's row shape (key `lotKey`). Memo Return / Memo Out / Sale keep their behaviour.
- Keep query keys under `["stock-adjustment", …]`. Invalidate the list and detail after each mutation, and invalidate `["stock-card"]` / `["stock-value"]` after an effective save or approve.
- There is no polling. Refresh (H-02) refetches the detail.
