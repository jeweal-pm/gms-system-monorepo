# Frontend data flow: vendor

- UI revision: 1
- Existing approved contracts reused unchanged: gateway tRPC `permission.mine` → `{ isSuperAdmin, permissions: "ALL" | string[] }`; the permission catalog already has the leaf `vendor` (`backend-api-auth/src/permission/catalog.ts`, Partner Master group), so `vendor:VIEW/ADD/EDIT/DELETE` need no catalog change.
- **Backend requirement: requires-sa.** No `vendor.*` procedure, Vendor table or rule exists. ADR-0018 §1 only reserves Vendor for `backend-api-partner`. The table below states what the UI needs, modeled on the approved [customer contract](../../backend/partner/customer/api-contract.md); SA decides the final shapes, names and error codes.

| UI action / TODO ID | Operation (proposed) | Input / output (UI need) | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Page guard / FE-VEN-003 | `permission.mine` (existing) | checks `vendor:VIEW/ADD/EDIT/DELETE` | staleTime 30 s (shared key with the shell and other pages) | skeleton; error + Retry; denied page | auth (done) |
| Currency + Country options / FE-VEN-005, 006 | `vendor.options` **or** a shared partner options procedure (A-02) | → `{ currencies: [{ code, name }], countries: [{ code, name }] }` | staleTime `Infinity` | "Loading…" option; error + Retry | partner via gateway |
| Drawer list / FE-VEN-008 | `vendor.list` | `{ q?: ≤ 100, cursor?, limit: 50 }` → `{ items: [{ id, name, code, active, updatedAt }], nextCursor, total }` (+ the invoice company name only if Q-VEN-04 asks for it) | `useInfiniteQuery`, key includes `q`; staleTime 30 s; unfiltered key gives the header total | skeleton ×3; "No vendors yet"; `No vendors match "{q}"`; inline error + Retry | partner |
| Open vendor / FE-VEN-010 | `vendor.get` | `{ id }` → `{ id, name, code, active, updatedAt, createdAt, currencyCode, firstName, middleName, lastName, phone, email, invoiceAddresses: [{ id, position, name, taxId, address, countryCode, state, city, postcode, isDefault }] }` | key `{ id }`; `skipToken` with no selection | form skeleton; not found; error + Retry | partner |
| Create / FE-VEN-010 | `vendor.create` | same fields without IDs → `{ id, updatedAt }` | invalidate `list`; select the new id | `Creating...` | partner |
| Save / FE-VEN-010 | `vendor.update` | `{ id, expectedUpdatedAt, ...fields }`; addresses replace the stored set → `{ id, updatedAt }` | invalidate `get(id)`, `list` | `Saving...`; stale → banner + Reload | partner |
| Delete / FE-VEN-009 | `vendor.delete` | `{ id }` → `{ ok: true }` | reset `get`, invalidate `list`, select draft | dialog `Deleting...` | partner |
| Duplicate, Print, Refresh | client only / refetch | as customer | as customer | as customer | frontend |

## Rules

Same as [customer data-fetching rules](../customer/data-fetching.md#rules): typed tRPC client only (never call
partner directly); 50 rows per page, one page request in flight, no polling, debounced search, options fetched
once; reads retry at most twice for transient errors only; **mutations are never retried**; no optimistic
updates; only the current selection's `get` result resets the form; a background refetch never resets a
dirty form; no vendor data in `localStorage`.

## Independent work versus SA-dependent wiring

After UI approval, FE-VEN-001…009 and 011–012 can be built and checked against a typed **fixture adapter**
in `frontend/src/features/vendor/api.ts`, marked `FIXTURE ADAPTER`, whose mutations reject with "Saving isn't
connected yet. Nothing was saved." (the customer approach). FE-VEN-010 replaces it with `trpc.vendor.*` after
the SA bundle is approved and backend delivers. `permission.mine` is live from the start.

## Requirements for the SA bundle

Sent with feature `vendor`, UI revision 1 ([handoff](../../../coordination/handoffs/vendor-sa.md)):

| ID | Need | Affected FE IDs |
|---|---|---|
| SA-VEN-01 | Decision record for Vendor in `backend-api-partner`: new ADR (proposed ADR-0019) or an ADR-0018 revision; data model `Vendor` + `VendorAddress` (invoice only) in schema `partner`; migration | all data items |
| SA-VEN-02 | `vendor.list/get/create/update/delete` zod shapes exported through `AppRouter`, guarded by `permittedProcedure("vendor", …)`; list order, cursor and search semantics as customer; the drawer second line per Q-VEN-04 | FE-VEN-008, 010 |
| SA-VEN-03 | Field rules incl. the owner's answers to **Q-VEN-02** (Phone required?) and **Q-VEN-03** (default address); limits (1–10 addresses, lengths) | FE-VEN-005..007 |
| SA-VEN-04 | Options source: `vendor.options` or a shared partner options procedure | FE-VEN-005, 006 |
| SA-VEN-05 | Error codes (proposed `VENDOR_NOT_FOUND`, `VENDOR_CODE_TAKEN`, `VENDOR_STALE`, `VALIDATION_ERROR` with `invoiceAddresses.N.field` paths, `PARTNER_UNAVAILABLE`, `PERMISSION_DENIED`); delete policy (permanent like customer?) and the rule that purchase documents keep their own copy of vendor data | FE-VEN-009, 011 |
| SA-VEN-06 | Gateway dashboard shortcut: Vendor item `href: "/setup/vendor"` (as Customer) | FE-VEN-002 |
| SA-VEN-07 | Capacity/infra: confirm no new container, pool or body-limit change in `backend-api-partner`; if any runtime change is needed, route to infra | — |
| SA-VEN-08 | Refine [vendor-flow.md](../../../diagram/vendor-flow.md) and add the vendor sequence diagrams | — |
