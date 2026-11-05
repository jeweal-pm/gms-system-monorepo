# Authorization: master / purchase (SA revision 1, approved 2026-11-04)

## Catalog (auth): no change

- Leaf `purchase` "Purchase" already exists in section PURCHASE (`backend-api-auth/src/permission/catalog.ts`), with all actions (VIEW, ADD, EDIT, DELETE, CANCEL, APPROVE, PRICE, …). No auth migration and no grant copy. Super admin passes every check (ADR-0017).
- Master: `MasterMenu` gains `"purchase"` (`backend-api-master/src/master/authorization.ts`).

## Procedure rules (master, ADR-0031 boundary)

| Procedure | Rule | Notes |
|---|---|---|
| `purchase.list`, `purchase.get`, `purchase.nextNumber`, `purchase.options` | `permitted("purchase", "VIEW")` | `get` enforces VIEW for the `[id]` route (security note 2026-11-04). |
| `purchase.memoStock` | `permitted("purchase", "VIEW")` | Vendor and currency are required. It returns only memo stock fields, never other documents' customer data (`sale` is null). |
| `purchase.purchaseOrderLines` | `permitted("purchase", "VIEW")` | D9: `purchase-order:VIEW` is not also required. Only APPROVED PO lines are shown. |
| `purchase.create` | `permitted("purchase", "ADD", true)` (grant + CSRF) | |
| `purchase.update` | `permitted("purchase", "EDIT", true)` | Pending only (domain rule). |
| `purchase.delete` | `permitted("purchase", "DELETE", true)` | Pending only. No stock involved. |
| `purchase.approve` | `permitted("purchase", "APPROVE", true)` | Cuts the stock (D2). The creator may approve (as SA-PO-09). |
| `currency.options` | `permittedAny([... existing ..., "purchase"], "VIEW")` | Header currency list and rates. |
| `memoStock.list` | **unchanged** (not opened to purchase) | Purchase uses `purchase.memoStock`. |

The order of checks is the existing `requireMasterGrant` order: `UNAUTHENTICATED` → `AUTHORIZATION_UNAVAILABLE` → `LICENSE_REQUIRED` → `CSRF_INVALID` (mutations) → `PERMISSION_DENIED`. Zod input validation runs after the grant, so a user without access learns nothing about input shape. CSRF is the existing same-origin `x-gms-csrf` header check.

## Data rules that are authorization-relevant

- Ids sent by the browser (`memoStockId`, `purchaseOrderLineId`) are only references. The server re-reads them at Save and again under the lock at Approve. A row of another vendor or currency, or a PO that is not approved, is refused (`PURCHASE_REFERENCE_INVALID`), so ids cannot cross vendors. The pickers filter by the vendor and currency given and return nothing else.
- Pending, available, price unit and stone details are never taken from the browser (SA-PU-14).
- PRICE is not masked in revision 1 (the other trade documents behave the same way).

## Frontend gates (FE-PU-003…005)

- Page and daybook: `purchase:VIEW` (`useDocumentAccess("purchase")`, already built).
- Create New / Save: ADD (new) or EDIT (saved). Delete: DELETE. Approve button: APPROVE, shown only while Pending Approval. The server re-checks every call.
- The Memo Stock and Purchase Order buttons need VIEW. They stay blocked until a vendor and a currency are chosen.
