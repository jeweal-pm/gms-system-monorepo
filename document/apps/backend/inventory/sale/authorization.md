# Authorization: inventory / sale (SA revision 1, approved 2026-11-18)

Authentication chain, license check, CSRF and live grants are the inventory platform's ([load-to-stock authorization](../load-to-stock/authorization.md)); nothing new is introduced. Catalog leaf `sale` (section SALE) already exists in `backend-api-auth/src/permission/catalog.ts` with VIEW / ADD / EDIT / DELETE / APPROVE; no auth migration.

## Public operations

| Operation | Required grant | Extra rule |
|---|---|---|
| options, next-number, list, get, reserve-lines, photo read | `sale:VIEW` | photo read only for files linked from a Sale line, or the caller's own unlinked upload |
| create | `sale:ADD` | CSRF |
| update | `sale:EDIT` | CSRF; status DRAFT/REVISION_REQUESTED (creator or EDIT holder, as other documents) or auto-approved and not used |
| submit | `sale:ADD` or `sale:EDIT` | CSRF; approval ON |
| approve / request-revision / reject | `sale:APPROVE` + `sale:VIEW` | CSRF; ADR-0050 approver selection (Approve multi-select = leaf APPROVE); the creator may approve only if granted (same as other types) |
| delete / restore | `sale:DELETE` | CSRF |
| photo upload | `sale:ADD` or `sale:EDIT` | CSRF; limiter |
| approval-settings `sale` | `approval-setup:VIEW` / `EDIT` | as ADR-0052 D8 |
| Approve Center summary/pending `sale` | `sale:APPROVE` + `VIEW` | — |
| notifications | signed in | recipient rows only |

Super-admin bypass and license rules as the platform. Every check runs on the server for each call; UI gating is convenience only.

## Master changes

| Procedure | Grant |
|---|---|
| `currency.options` | existing menus **or `sale:VIEW`** (`MasterMenu` gains `sale`) |
| `memoStock.list` | existing `permittedAny([...])` **+ `sale`**, VIEW |
| internal `/internal/v1/inventory/sale*`, numbering `sale` | service token `INVENTORY_MASTER_SERVICE_TOKEN` only (constant-time compare); no user grant evaluated in master; `X-Actor-User-Id` for audit only |

## Data exposure

- From Reserve lists only Reserves of the customer and currency the caller supplied; a VIEW holder can see any customer's open reservations, which equals what `reserve.list`/`get` already expose to `reserve:VIEW` — but `sale:VIEW` alone now reveals Reserve numbers, dates, stone attributes and the Reserve net price. Accepted for Sale (the seller needs the agreed price, Q-SL-06). The new internal reads (`prepare`, reserve-lines search) never return the vendor memo cost. **Note:** the existing `memoStock.list` response includes the vendor `unitPrice` / `netUnitPrice` (checked in `memo-stock.service.ts`); granting it to `sale:VIEW` exposes that cost to Sale viewers exactly as it already is to Quotation / Reserve / Memo Out viewers, and the UI does not display it (Q-SL-06). Removing cost fields from that shared response is a separate change for all callers (not in this revision).
- The service token is not reachable from the browser (internal network `inventory-master`, nginx rejects `/internal`).
- Logs carry ids, doc numbers and codes only; no prices, addresses or photo bytes.
