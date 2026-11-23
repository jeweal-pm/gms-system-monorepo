# Authorization: inventory / sale-own-stock

- Source UI revision / SA revision: Sale UI 1 + addendum A / **1** (pending-review)
- Domain rules / API contract: [decisions](decisions.md), [api-contract](api-contract.md). The authentication chain (access cookie -> JWT -> live `auth.current_authorization` -> license, fail closed) and CSRF are the inventory platform's, unchanged ([sale authorization](../sale/authorization.md), [load-to-stock authorization](../load-to-stock/authorization.md)).

## Catalog change (auth service)

**None.** The leaf `sale` and its actions exist. No new leaf, no grant migration, no router menu change.

## Operations

| Operation / resource | Authentication | Required grant | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `GET /sale/stock-lots` | cookie -> JWT -> live authorization -> license | **`sale:VIEW`** (the grant that already protects `sale/options` and `sale/reserve-lines`; picking an item is part of building a Sale, so VIEW, not a new action) | `requireGrant(principal, "sale", "VIEW")` before any query or master call | 401, 403 `PERMISSION_DENIED` (`details.required = "sale:VIEW"`), 503 when authorization or license is unavailable | BE-SO-004 / IT-SO-A1…A4 |
| `POST /sale` with `OWN_STOCK` lines | same | `sale:ADD` | unchanged | 403 | BE-SO-003 / IT-SO-A5 |
| `PUT /sale/{id}` | same | `sale:EDIT` | unchanged | 403 | IT-SO-A5 |
| `POST /sale/{id}/approve` (moves own stock) | same | `sale:APPROVE` + `VIEW` | unchanged (`canApprove`) | 403 | IT-SO-A6 |
| `POST /sale/{id}/delete`, `/restore` (releases own stock for an auto-approved Sale) | same | `sale:DELETE` | unchanged | 403 | IT-SO-A6 |
| `POST /internal/v1/inventory/sale/memo-lots` (master) | service token | machine caller (inventory) | `Authorization: Bearer <INVENTORY_MASTER_SERVICE_TOKEN>` constant-time, ≤ 4 in flight, strict body ≤ 4 KiB | 401 `SERVICE_UNAUTHENTICATED`, 503 busy | BE-SO-006 / IT-SO-M1 |

**What Sale does not use.** The Sale read never requires or checks `quotation`, `reserve` or `memo-out` permissions, and a `sale`-only principal can pick, save and approve own-stock Sales. Conversely `quotation` / `reserve` / `memo-out` VIEW does **not** open `GET /sale/stock-lots` (its own grant only).

**R2-F1 closure (INV-20261121-002).** The finding was that master `fromStock.lots` listed own-stock lots to a caller whose only grant was `sale:VIEW`, with no Sale purpose. After this revision the purpose exists and has its own door: the Sale read is hosted by inventory and checked against `sale:VIEW` there; master then removes `sale` from the grants of `fromStock.lots` (BE-SO-009), so master's quotation / reserve / memo-out picker no longer serves Sale users. Test: a principal with only `sale:VIEW` is refused by `fromStock.lots` and served by `sale/stock-lots`.

## Data exposure

- **Own-stock rows** (`GET /sale/stock-lots`): Lot, stone attributes, Location Master name, item note, Load number and date, quantities, price unit, and `salePrice` (the lot's Sale Price in the company currency). **Never**: Stock ID, cost (`unit_cost_base`, `cost_amount_base`), `stock_price`, vendor, Load row ids. The Sale Price is a list price the Sale user quotes to the customer; a `sale:VIEW` holder may see it (the Stock Value report separately exposes the same price under `stock-value:VIEW`).
- **Memo Stock rows**: unchanged data class, **narrower** than today (the Sale picker used `fromStock.lots`, which returns unit price, net price, amount and vendor of Memo Stock; the new read strips them, and master's internal route strips them at the source).
- **Detail / lines**: `LineOut` for an own line shows lot, stone details, Load number, quantities; `stockId` is `""`; allocation rows (with Stock IDs) are never returned.
- **Ledger and Stock Card**: a Sale OUT row is visible under `stock-card:VIEW` with the Sale number, date, customer name, Stock ID (registry; SQ-SO-07) and quantities, like every other document row. It is document-level reporting.
- **Search**: `q` matches lot, stone, stone code, cer no. and source document number; it never matches a Stock ID.
- **Logging**: ids, counts, revision, durations; never prices, customer names, search text or Stock IDs (a Stock ID may appear only in the debug log of a refusal as today's holds do not log it either).
- **Injection**: `q` bound and `LIKE`-escaped; `location` bound; `lotKey` format-checked and bound; sort is fixed; the `stock_movement` and allocation writes use bound `VALUES`; the bucket SQL is fixed text.
- **Cross-object checks**: a `lotKey` / `lineId` / `reserveLineId` is an identifier, never a capability; the server re-derives the lot, checks the Reserve line's customer and currency through master, and re-checks the grant on every call. There is no per-location or per-customer scope in the permission model.

Frontend visibility (hiding the From Stock button, disabling Approve) is convenience only; every check above runs on the server.
