# Data fetching: location-master (UI rev 1)

Contracts: [api-contract](../../backend/master/location-master/api-contract.md) (SA rev 1, pending-review).

| UI need | Call (tRPC `/api/master/trpc`) | Cache | Notes |
|---|---|---|---|
| Drawer list, search, infinite scroll | `locationMaster.list { q?, active?, cursor?, limit }` | `staleTime` 30 s, key per search | same paging as `stoneMaster.size.list` |
| Open a record | `locationMaster.get { id }` | 30 s | `version` for Save / Delete |
| Create / Save / Delete | `locationMaster.create / update / delete` | invalidate `[["locationMaster"]]`, `[["purchaseOrder","options"]]`, `[["purchase","options"]]` | CSRF via the existing mutation fetch |
| PO / Purchase Location dropdown | `purchaseOrder.options` / `purchase.options` → `locations: string[]` | existing options query, refreshed when the dropdown opens | active names only, sorted |
| Access | `permission.mine` (`location-master`) | existing | menu guard as Stone Master |

No new client library, store or polling. Errors map through the existing `readDomainError`.
