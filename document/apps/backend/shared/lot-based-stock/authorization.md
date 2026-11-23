# Authorization: lot-based stock (SA revision 1, approved 2026-11-20)

No permission catalog change, no new auth leaf, no auth migration.

| Operation | Rule | Change |
|---|---|---|
| `memoStock.lots` | VIEW on `memo-return` or `memo-receive` | same as the removed `memoStock.list` |
| `fromStock.lots` | VIEW on any of `quotation`, `reserve`, `memo-out`, `sale` | `sale` added. Sale From Stock read `memoStock.list` under `sale:VIEW` (ADR-0054 D10); it moves to this procedure. |
| `purchase.memoStockLots` | `purchase:VIEW` | same as the removed `purchase.memoStock` |
| Document save / approve with lot lines | Unchanged per document (ADD/EDIT, APPROVE; ADR-0050 flow) | none |
| `memoOutstanding` (MOR picker) | unchanged | none |
| Inventory `POST /internal/v1/master/stock/lots[/available]` | `MASTER_INVENTORY_SERVICE_TOKEN`, constant-time check, `/internal/v1/master/*` only; ≤ 4 in flight (`503 INVENTORY_BUSY`) | new routes under the existing guard |
| Master `PUT /internal/v1/inventory/sale-consumptions/*`, `sale/prepare`, `sale/reserve-lines` | `INVENTORY_MASTER_SERVICE_TOKEN` | v2 fields only |
| Inventory Sale REST | `sale` leaf as ADR-0054 | none |

Data exposure rules:

- Lot rows of our stock never carry cost, Stock Price or Sale Price (ADR-0052 D16).
- Memo Stock lot rows carry the (average) price, amount and vendor in **every** lot picker, including the customer-side pickers (`fromStock.lots` for Quotation, Reserve, Memo Out and Sale). This is the same exposure as the removed `fromStock.list` / `memoStock.list` / `purchase.memoStock` (owner decision 2026-11-21, INV-20261121-002 H1: keep price and vendor in lot pickers; no new projection). Our-stock rows never carry cost or price.
- `lotKey` is not an opaque hash for a one-row group: `MS` / `OS` + the row's uuid, which is the same internal id the legacy `memoStockId` / `ownStockId` fields already expose. For a merged group (`ML`, Memo Stock only) it is `ML` + the md5 of the shared details and reveals nothing beyond the row.
- The server never trusts a client-sent snapshot. It re-derives the group from `lotKey` on Save and Approve.
- A `lotKey` whose prefix does not match the line source, or which does not match the regex, is rejected before any query (`VALIDATION_ERROR`). A new line that names an item id (`memoStockId` / `ownStockId`) is refused with `lot_required` (FE-LOT-008); only an item already on the stored document stays acceptable.
- CSRF (Origin/Fetch-Metadata) on mutations is unchanged.
