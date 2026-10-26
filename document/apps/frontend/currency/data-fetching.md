# Frontend data flow: currency

- UI revision: 1 (approved 2026-10-26)
- Contract: [SA decisions rev 1](../../backend/master/currency/decisions.md), in backend-api-master `currency.*` (master tRPC `/api/master/trpc`)

| UI action | Procedure (permission) | Input → output | Query / cache |
|---|---|---|---|
| Drawer list + total | `currency.list` (currency:VIEW) | `{q?, cursor?, limit ≤ 50}` → `{items: {id, code, name, active, sellingRate, buyingRate}[], nextCursor, total, baseCode}` | infinite query, staleTime 30 s |
| Load one | `currency.get` (currency:VIEW) | `{id}` → `{id, code, name, description, active, sellingRate, buyingRate, createdAt, updatedAt, baseCode}` | staleTime 30 s |
| Create | `currency.create` (currency:ADD + CSRF) | `{code, name, description, active, sellingRate, buyingRate}` → `{id, updatedAt}` | invalidate list + every currency option query |
| Save edit | `currency.update` (currency:EDIT + CSRF) | `{id, expectedUpdatedAt, name, description, active, sellingRate, buyingRate}` (no `code`) → `{id, updatedAt}` | same |
| Delete | `currency.delete` (currency:DELETE + CSRF) | `{id}` → `{ok: true}` | same |
| Quotation currency select | `currency.options` (currency:VIEW **or** quotation:VIEW) | none → `{items: {code, name, active, sellingRate, buyingRate}[], baseCode}` (≤ 500) | staleTime 60 s |
| Company Profile / Vendor / Customer selects | existing `companyProfile.options`, `vendor.options`, `customer.options` | `currencies` now come from this table: `{code, name, active}[]` | staleTime 60 s (was Infinity) |

- Rates travel as decimal strings with 4 decimals (`"33.2500"`) or `null`. The base currency always has `null`.
- After any currency write, the page invalidates `currency.*`, `companyProfile.options`, `vendor.options` and `customer.options`, so other pages pick up the change.
