# Error handling: lot-based stock (SA revision 1, approved 2026-11-20)

| Code | HTTP | When | Details | Changes | UI text (FE-LOT-007) |
|---|---|---|---|---|---|
| `VALIDATION_FAILED` `lines.N.reference` `lot_required` | 400 | new stock line sent with an item id | path | nothing | "Pick this item again from the list" |
| `VALIDATION_FAILED` `lines.N.reference` `invalid` / `vendor_mismatch` / `currency_mismatch` | 400 | bad key format / prefix, or a lot of another vendor or currency (Memo Return, Purchase) | path | nothing | field error on the row |
| `STOCK_LOT_UNAVAILABLE` | 422 | the group has no open row at Save (all taken or returned) | `lines.N.reference` | nothing | "Row n: this lot has nothing left" |
| `<DOC>_PENDING_SHORT` (existing codes) | 409 | apply: the lot or its allocation is short under the lock | `details.lines[] {index, lotKey, availablePcs, availableWeightCt}` and field paths `exceeds_pending` | rolled back | "Row n: only x pcs / y ct left in lot L" |
| `STOCK_LOT_TOO_LARGE` | 422 | > 500 candidate rows in one lot, or > 2,000 in one apply | `details {lotKey?, limit}` | nothing | "Lot L is too large to pick in one document; contact admin" |
| `SALE_CONSUMPTION_EXCEEDS_AVAILABLE` | 409 (internal) → Sale `SALE_SOURCE_SHORT` | lot / reserve allocation short in master | `details.lines[] {lineId, availablePcs, availableWeightCt}` | nothing in master; inventory tx1′ | same as short |
| `STOCK_HOLD_EXCEEDS_AVAILABLE` (existing, internal) | 409 | own-stock pre-read raced | `{stockId}` → master maps it to the lot line | op ended, nothing held | "Row n: lot L changed, refresh and try again" |
| `INVENTORY_UNAVAILABLE` (existing) | 503 | pre-read `stock/lots` fails / times out | — | nothing saved | existing text |
| `<CODE>_IN_USE` (existing) | 409 | releasing allocation that a downstream document settled (returned / sold / purchased) | `usedBy` via `latestStockUser` incl. alloc tables | nothing | existing text |

Rules:

- Every apply validates all lines before writing. Short errors list every short line, and nothing changes.
- No HTTP call runs inside a database transaction (ADR-0052 D4/D19 unchanged).
- Retries:
  - picker reads: `retryTransient` (frontend, existing);
  - own-stock pre-read: no automatic retry inside the request (the user retries);
  - saga re-drive: unchanged. Master's stored result makes Sale allocation replays deterministic.
- Logging: lot keys and Stock IDs may be logged server-side. Prices and costs are never logged. Error responses to the browser never contain a Stock ID (`STOCK_HOLD_EXCEEDS_AVAILABLE` details are mapped to the line and lot before leaving master, Q-LOT-10).
