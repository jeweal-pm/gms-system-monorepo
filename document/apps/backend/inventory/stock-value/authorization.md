# Authorization: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Domain rules / API contract: [decisions](decisions.md), [api-contract](api-contract.md); the authentication chain, license check and live grants are the inventory platform's ([load-to-stock authorization](../load-to-stock/authorization.md)); the grant gate pattern is Stock Card's ([authorization](../stock-card/authorization.md)). Nothing new is introduced there.

## Catalog change (auth service)

**None.** The leaf `stock-value` (section `report`, group `stock-movement`, all nine actions) already exists in `backend-api-auth/src/permission/catalog.ts` (ADR-0056 D9), and the migration `20261123100000_stock_card_grants` already copied the old consignment grants to it. No catalog edit, no migration, no router menu change, no user-permission contract change. The key pattern and the 64-leaf maximum are unaffected.

| Action | Needed by this feature | Backend enforcement |
|---|---|---|
| VIEW | every `GET` route | `requireGrant(principal, "stock-value", "VIEW")` before any query |
| PRINT | the browser print of the loaded page (frontend gating only; no endpoint) | none (data already returned under VIEW) |
| EXCEL | **nothing**: Excel stays unavailable (no export library approved, SQ-SV-16); no endpoint | none; the UI keeps the control disabled. If an export is added later it needs its own SA revision and a server check of `stock-value:EXCEL` |
| ADD / EDIT / DELETE / APPROVE / RESTORE / ... | not applicable (read-only report) | none |

## Operations

| Operation / resource | Authentication | Allowed roles / ownership | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `GET /stock-value/options`, `/cards`, `/cards/{key}`, `/cards/{key}/transactions` | access cookie -> JWT -> live `auth.current_authorization` -> license | holders of `stock-value:VIEW`, or super admin | `requireGrant` before any query; the principal comes from the live authorization row on every request | 401 unauthenticated, 403 `PERMISSION_DENIED` (`details.required = "stock-value:VIEW"`), 503 when authorization or license is unavailable (fail closed) | BE-SV-004 / UT-SV-A1, IT-SV-A1...A4 |

`stock-card:VIEW` does not grant Stock Value, and `stock-value:VIEW` does not grant Stock Card: a user may see quantities without values and the reverse is a separate grant (the owner's two menu items).

## Data exposure

- A `stock-value:VIEW` holder sees what Stock Card shows (stone attributes, location, lot, vendor name, document numbers, dates, account names, quantities; Stock ID hidden server-side on `memo-out`) **plus** the current sell price (Price list), the last Invoice price with its **number and date** (no customer, no discount, no tax), the valuation (`amount`) and the **Profit/Loss**.
- **Cost:** the unit cost and cost amount are never returned. Profit/Loss is `amount - cost`, so a holder can infer the cost of one card; this is accepted because both are the same report permission (SQ-SV-09). If the owner wants cost hidden, the alternatives are a separate leaf or omitting `profitLoss` (a catalog change, a new SA revision).
- **Last sale link:** `priceRef.docId` lets the UI open the Sale; the Sale page enforces its own `sale:VIEW`. The report does not require `sale:VIEW` to show the number, so a Stock Value holder without Sale access learns that an invoice with that number and date set the price. Accepted as document-level reporting (as Stock Card document numbers).
- **Stock ID:** unchanged rule; hidden types return `stockId = null`, and search matches visible IDs only. The price source never carries a Stock ID.
- **Cross-object checks:** the card key is a hash of attributes, not a secret and not a capability; every call re-checks the grant. There is no per-location or per-customer scope in the permission model.
- **Logging:** ids, card-key prefixes, counts, mode and timings only; never prices, amounts, account names, document numbers or search text beyond its length.
- **Injection:** `sort` / `dir` / `pageSize` are enumerations mapped to fixed SQL fragments; `q`, `location`, dates, `cardKey` and the exact price / cost passed from statement A to B are bound parameters (the price and cost are values computed by the database in the same transaction, never client input); `LIKE` metacharacters are escaped.

Frontend visibility (hiding the menu, the print icon or the Profit/Loss column) is convenience only; every check above runs on the server.
