# Frontend data flow: customer

- UI revision: 1
- Related shared/SA API contract: [ADR-0018](../../../adr/0018-customer-master-partner-service.md) §2 (Accepted rev 1) fixes the procedure names, permissions, error codes and timeouts. The **exact input/output shapes** belong to the SA bundle `document/apps/backend/partner/customer/` (not written yet; ADR-0018 follow-up step 2). Existing approved contract reused unchanged: gateway tRPC `permission.mine` → `{ isSuperAdmin: boolean, permissions: "ALL" | string[] }` (user-permission SA rev 1).
- SA draft found during this run: [api-contract.md](../../backend/partner/customer/api-contract.md) (SA revision 1, **pending-review**, written in parallel). The table below is aligned to that draft; if SA review changes it, FE-CUS-014/015 follow the approved version.
- Backend requirement: **pending-SA-review** (operations approved by ADR; shapes from the SA draft, which still needs its separate owner approval). `permission.mine` is unchanged-approved.

Shapes in the table follow the SA draft. Where the draft differs from what this UI first asked for, the UI adapts (noted in the SA requirements table).

| UI action / TODO ID | Operation | Input / output (UI need) | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Page guard / FE-CUS-004 | `permission.mine` (existing) | → `{ isSuperAdmin, permissions }`; UI checks `customer:VIEW/ADD/EDIT/DELETE` | tRPC key; staleTime 30 s (same as user-permission) | skeleton; error + Retry; denied page | auth/gateway (done) |
| Currency + Country options / FE-CUS-006, 007 | `customer.options` | none → `{ currencies: [{ code, name }], countries: [{ code, name }] }` (ISO 4217 / ISO 3166-1 alpha-2; English display names) | staleTime `Infinity` (static per deploy); fetched once per session | select shows a disabled "Loading…" option; error under the field + "Retry"; never empty | partner via gateway |
| Drawer list, count, search, paging / FE-CUS-009 | `customer.list` | `{ q?: string (trimmed, ≤ 100), active?: boolean (unused by this UI), cursor?: string, limit: 50 }` → `{ items: [{ id, name, code: string \| null, active, updatedAt }], nextCursor: string \| null, total: number }`; order `lower(name), id` | `useInfiniteQuery`, key includes `q` (a new `q` restarts without a cursor, as the draft requires); staleTime 30 s; `getNextPageParam = nextCursor`; search debounced 300 ms and capped at 100 characters in the input; the unfiltered key (`q` absent) supplies the header/drawer `total` | 3 skeleton rows; inline error + Retry; "No customers yet"; `No customers match "{q}"`; a spinner row while loading more | partner via gateway |
| Open customer / FE-CUS-014 | `customer.get` | `{ id }` → `{ id, name, code, active, updatedAt, createdAt, currencyCode, firstName, middleName, lastName, phone: { country, e164 } \| null, email, invoiceAddresses: [{ id, position, name, taxId, address, countryCode, state, city, postcode, isDefault }], shippingAddresses: [same without taxId] }` | key `{ id }`; `skipToken` while no selection; staleTime 30 s; the form resets only when the selected `id` changes (or after Refresh/save) | form skeleton; `CUSTOMER_NOT_FOUND` → inline message, list invalidated; other → inline + Retry | partner via gateway |
| Create / FE-CUS-014 | `customer.create` (mutation) | `{ name, code, currencyCode, active, firstName, middleName, lastName, phone, email, invoiceAddresses[], shippingAddresses[] }` (no IDs, array order = position) → `{ id, updatedAt }` | on success: invalidate `list`; select the new id (one `get` follows) | button `Creating...`; errors per [error-handling.md](error-handling.md) | partner |
| Save / FE-CUS-014 | `customer.update` (mutation) | `{ id, expectedUpdatedAt, ...same fields }`; the address arrays **replace** the stored ones (ADR §2; address IDs are not sent) → `{ id, updatedAt }` | on success: invalidate `get(id)` and `list`; reset the form when the fresh `get` arrives | `Saving...`; `CUSTOMER_STALE` → banner + Reload | partner |
| Delete / FE-CUS-012 | `customer.delete` (mutation) | `{ id }` → `{ ok: true }` (or empty) | on success: `reset(get, {id})`, invalidate `list`, selection → draft | dialog `Deleting...`; error stays in the dialog; `CUSTOMER_NOT_FOUND` → treat as already deleted | partner |
| Duplicate / FE-CUS-011 | client only, from the loaded `get` data | — | none | — | frontend |
| Print / FE-CUS-013 | client only (`window.print()` over the loaded `get` data) | — | none | — | frontend |
| Refresh / FE-CUS-010 | refetch `list` (current search, first page) and `get` (if selected) | — | `invalidate` both; then reset the form to the fresh `get` | toolbar icon spins while either is fetching | frontend |

## Rules

- Use only the existing typed tRPC client and the QueryClient in `frontend/src/providers/app-providers.tsx`. The frontend never calls `backend-api-partner` directly (ADR-0018 §1: gateway only).
- **Bounds (4 GB / 2 vCPU host):** list pages are 50 rows (ADR cap); no "load all"; at most one page request in flight; no polling. Search is debounced 300 ms and not sent for unchanged trimmed text. The options payload (~160 currencies + ~250 countries) is fetched once. A customer holds at most 20 addresses, so the request body stays far below the 256 KB route limit (ADR capacity).
- Reads retry at most twice, only for 5xx/network/`PARTNER_UNAVAILABLE` (reuse `retryTransient` from `frontend/src/lib/trpc-error.ts` after FE-CUS-001). **Mutations are never retried** (ADR §2: "ไม่ retry mutation").
- Double submit: the primary button is disabled while a create/update is pending, and the submit handler ignores re-entry. Delete is disabled while pending.
- No optimistic updates (the server enforces unique Code Name and the stale check).
- Race: the `get` query key includes the id; only the current selection's result is applied to the form. A late `get` for a previous selection is ignored. Infinite-list results for an old search are not shown (key includes `search`).
- `refetchOnWindowFocus` (TanStack default `true`) may refetch `get` in the background; that refreshes the cache but must not reset a dirty form (see conventions).
- No customer data is written to `localStorage`; only the drawer open state may be.

## Independent work versus SA-dependent wiring

After UI approval, FE-CUS-001…013 and 016–017 can be built against a typed **fixture adapter** in
`frontend/src/features/customer/api.ts`, marked `FIXTURE ADAPTER` (a few sample customers, a short
currency/country list). Like user-permission, the fixture must not imply that anything was saved:
create/update/delete resolve with "Saving isn't connected yet. Nothing was saved." FE-CUS-014/015
replace the fixture with `trpc.customer.*` after the SA bundle is approved and backend delivers
the procedures. `permission.mine` is real from the start (FE-CUS-004).

## Requirements for the SA bundle

Needs sent to SA with feature `customer`, UI revision 1 (ADR-0018 step 2), and how the parallel SA draft
(revision 1, pending-review) answers them:

| ID | Need | SA draft answer | Remaining for SA review | Affected FE IDs |
|---|---|---|---|---|
| SA-CUS-01 | Exact zod shapes for all six procedures, exported through `AppRouter` so the frontend infers types | Shapes defined | Confirm export through `AppRouter` like `userAdmin.*` | FE-CUS-014 |
| SA-CUS-02 | `customer.list` cursor, order, search semantics, and whether `total` is for the filtered query | Opaque base64url cursor; `lower(name), id`; `q` ≤ 100; `total` returned | **Whether `total` counts the filtered result**; search match type (contains? case-insensitive on Name and Code Name?). The UI works either way because the header uses the unfiltered query. | FE-CUS-009 |
| SA-CUS-03 | Address payload shape and ID retention | Two arrays `invoiceAddresses` / `shippingAddresses`; full replacement; no IDs in input | none | FE-CUS-008, 014 |
| SA-CUS-04 | `fieldErrors[].path` format | Dot-joined, e.g. `invoiceAddresses.1.postcode` (0-based index); codes = zod issue codes + `duplicate`, `unknown`, `multiple_defaults`, `invalid` | Confirm the index is 0-based | FE-CUS-015 |
| SA-CUS-05 | Server rule parity (email format, trimming, phone, default) | `z.email().max(254)` + lower-case; trim; empty optional → `null`; phone identical to `userAdmin`; zero defaults → index 0; >1 default → `multiple_defaults` | none (UI never sends 0 or >1 defaults) | FE-CUS-008 |
| SA-CUS-06 | `create`/`update` return the full customer | Declined: returns `{ id, updatedAt }` | none; UI does one extra `get` after create/update (bounded, 3 s timeout) | FE-CUS-014 |
| SA-CUS-07 | Gateway error formatting for `customer.*` | `data.domainCode`, `data.fieldErrors`; permission failure code is **`PERMISSION_DENIED`** | none | FE-CUS-015 |
| SA-CUS-08 | `customer.options` display-name locale | Sorted by code (currencies) / name (countries); locale not stated | State the locale (English proposed). UI re-sorts currencies by code for display anyway. | FE-CUS-006, 007 |
| SA-CUS-09 | Editable main flow | `document/diagram/customer-flow.md` written by SA | Align screen states with [ui-spec.md](ui-spec.md#main-user-flow) (Duplicate, Print, discard confirm) | — |

No container, storage or runtime resource is requested by the frontend. The new `backend-api-partner`
container is already decided by ADR-0018 §6 and goes through infra research before Compose changes.
