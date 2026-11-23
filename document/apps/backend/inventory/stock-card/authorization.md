# Authorization: inventory / stock-card

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Domain rules / API contract: [decisions](decisions.md), [api-contract](api-contract.md); authentication chain, license check and live grants are the inventory platform's ([load-to-stock authorization](../load-to-stock/authorization.md)); nothing new is introduced there.

## Catalog change (auth service)

The leaves `stock-movement-primary` and `stock-movement-consignment` (group `stock-movement`, section `report`) are replaced:

| New leaf | Label | Actions | Used by |
|---|---|---|---|
| `stock-card` | Stock Card | VIEW, PRINT, EXCEL | this feature; VIEW gates every read, PRINT and EXCEL are frontend gating only (Excel is unavailable) |
| `stock-value` | Stock Value | all nine (placeholder, no API) | the menu item only |

The key pattern `^[a-z0-9-]{1,64}$` and the 64-leaf maximum hold (the leaf count does not change). One auth migration copies existing grants: `INSERT INTO auth.user_permission SELECT user_id, 'stock-card', action FROM auth.user_permission WHERE menu_key = 'stock-movement-primary' AND action IN ('VIEW','PRINT','EXCEL') ON CONFLICT DO NOTHING`, and the same from `stock-movement-consignment` to `stock-value` (all actions). The old rows stay in the table and are ignored on read (existing rule: "stored grants for removed cells are ignored"). Super-admin bypass is unchanged. Alternative kept as SQ-SC-07: keep the old keys and rename labels only.

## Operations

| Operation / resource | Authentication | Allowed roles / ownership | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|
| `GET /stock-card/options`, `/cards`, `/cards/{key}`, `/cards/{key}/transactions` | access cookie → JWT → live `auth.current_authorization` → license | holders of `stock-card:VIEW`, or super admin | `requireGrant(principal, "stock-card", "VIEW")` before any query; the principal comes from the live authorization row on every request | 401 unauthenticated, 403 `PERMISSION_DENIED`, 503 when authorization or license is unavailable (fail closed) | BE-SC-003 / UT-SC-A1, IT-SC-A1…A4 |
| Internal `PUT` / `PATCH` `/internal/v1/master/stock-holds/*` | service token `MASTER_INVENTORY_SERVICE_TOKEN` (constant-time compare; refused when equal to the other direction's token) | api-master only, on the internal `inventory-master` network; nginx rejects `/internal` | existing guard; `X-Actor-User-Id` for audit only | 401 | BE-SC-004 / IT-SC-I1 |
| Auth catalog and grant copy | auth migration / tRPC catalog procedures | existing User and Permission rules | existing | existing | BE-SC-007 / UT-SC-C1, IT-SC-C1 |

## Data exposure

- A `stock-card:VIEW` holder sees, for own stock: stone attributes, location, lot, vendor name, document numbers and dates, customer and vendor names, and quantities. These are already visible to holders of Load to Stock, Memo Out and Memo Out Return; the report does **not** return prices, costs, notes, photos, certificate numbers or addresses. Accepted per document-level reports (as Memo Outstanding): the report permission is the gate, and the linked document still enforces its own VIEW when opened (Q-SC-21).
- **Stock ID:** hidden on `memo-out` (and the other four types) **server-side**; the response carries `null`, not a value the UI chooses to hide. Search cannot reveal it (visible rows only).
- **Cross-object checks:** the card key is a hash of attributes, not a secret, and is never a capability: every call re-checks the grant. There is no per-location or per-customer scope in the permission model, so a VIEW holder sees every card.
- **Logging:** ids, card keys, counts and timings only; never account names, document numbers or search text beyond its length.
- **Injection:** `sort` / `dir` / `pageSize` are enumerations mapped to fixed SQL fragments; `q`, `location`, dates and `cardKey` are bound parameters; `LIKE` metacharacters are escaped.

Frontend visibility (hiding the menu or the print icon) is convenience only; every check above runs on the server.
