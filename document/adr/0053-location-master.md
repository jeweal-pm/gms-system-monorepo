# ADR-0053: Location Master in api-master; documents keep the location name

- Status: Accepted
- Date: 2026-11-16
- Feature / source UI revision: `location-master` / 1
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner "อนุมัติ" in chat, 2026-11-16 (Q-LM-01…05 take their defaults); covers UI rev 1 + SA rev 1 and the bundle listed below
- Supersedes / related ADRs: [ADR-0024](0024-stone-master-in-partner-service.md) (Stone Master in the partner/master service), [ADR-0041](0041-purchase-order-document.md) Q-PO-06 (free-text location, superseded for manual rows by this ADR once accepted), [ADR-0042](0042-purchase-document-and-stock-deduction.md)

## Context

The owner asked for a Location Master page with one field, Name, laid out like Stone Master, a real API, and every
page that chooses a location to use it (2026-11-16). Today Purchase Order and Purchase manual rows take a free-text
location (`varchar(40)`); Quotation, Reserve, Memo Out and the returns copy it from stock; Memo Receive always stores
`Memo`. The Setup › Master Code dialog has a placeholder tile and the auth catalog already has the `location-master`
leaf. UI: [ui-spec](../apps/frontend/location-master/ui-spec.md); SA: [architecture](../apps/backend/master/location-master/architecture.md); TODO: [location-master](../task/todo/location-master.md).

## Decision

1. **Owner:** backend-api-master, table `partner.location` (name unique ignoring case, 1–40 chars, active, version).
   Router `locationMaster` (list / get / create / update / delete) gated by `location-master` grants; CSRF on writes.
   [database-diagram](../apps/backend/master/location-master/database-diagram.md), [sequence-diagram](../apps/backend/master/location-master/sequence-diagram.md), [api-contract](../apps/backend/master/location-master/api-contract.md).
2. **Documents keep the name as text** (existing `location` columns, no foreign key). Renaming, deactivating or deleting
   a location never changes a saved document.
3. **Choosing:** Purchase Order and Purchase manual rows choose from active locations, served in their existing
   `options` (`locations: string[]`, ≤ 500). The server accepts an active name (stored in the master's spelling) or the
   value already stored on that line; anything else is a field error. Copied rows and the stock-sourced documents are
   unchanged.
4. **Migration** `20261116090000_location_master` creates the table and seeds it once from the distinct names already
   typed on Purchase Orders and Purchases; `Memo` stays a system value.
5. **Frontend:** `/setup/location-master` as Stone Master › Size (Name + Active, drawer list); the Master Code tile
   becomes a link; the PO / Purchase Location field becomes a dropdown.

No new service, container, package, cache or infra change ([tech-stack](tech-stack.md) unchanged).

## Alternatives

- **Foreign key `location_id` on document lines:** stronger integrity, but needs migrations of every line table,
  breaks the snapshot rule used for parties and stone attributes, and blocks deleting a used location. Rejected for
  revision 1; the name snapshot already serves display, printing and stock copies.
- **Keep free text:** no consistency between users ("Safe A" vs "safe a"), which the owner wants to end.
- **Put locations in Stone Master's `stone` schema:** locations are not stone attributes; a separate master in
  `partner` keeps ownership clear and its own permission leaf.
- **Inventory service (Hono):** not built yet; Stock Transfer Location will read this master through api-master when it is.

## Consequences and capacity

- Additive API (`options.locations`) and a stricter check on PO / Purchase manual lines; older stored values stay valid.
- Rollback: drop the table and restore the free-text field; no document data changes.
- One table under 500 rows, indexed reads, options ≤ 500 names inside existing calls; no pool, cache or concurrency change on the 4 GB / 2 vCPU host.

## Acceptance and approval

- Covers: this ADR; [frontend ui-spec rev 1](../apps/frontend/location-master/ui-spec.md), [data-fetching](../apps/frontend/location-master/data-fetching.md), [testing](../apps/frontend/location-master/testing.md); [backend SA rev 1 bundle](../apps/backend/master/location-master/architecture.md); [TODO](../task/todo/location-master.md); [flow](../diagram/location-master-flow.md). Open questions Q-LM-01…05 take their defaults unless the owner answers.
- Checks: [backend testing](../apps/backend/master/location-master/testing.md) and [frontend testing](../apps/frontend/location-master/testing.md) pass; both security reviews on the final revision; manual browser check of the page and the PO dropdown.
- Approved 2026-11-16 (owner "อนุมัติ" in chat, 2026-11-16 (Q-LM-01…05 take their defaults)).
