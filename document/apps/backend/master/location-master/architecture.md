# Location Master — architecture (SA revision 1)

- Status: **approved** 2026-11-16 (owner "อนุมัติ" in chat, 2026-11-16 (Q-LM-01…05 take their defaults)) · UI revision 1 ([ui-spec](../../../frontend/location-master/ui-spec.md)) · [ADR-0052](../../../../adr/0052-location-master.md) (Accepted)
- Owning service: **backend-api-master** (schema `partner`), next to Stone Master, Currency and the documents that use locations. No new service, container, dependency or infra change.
- Bundle: [api-contract](api-contract.md) · [database-diagram](database-diagram.md) · [sequence-diagram](sequence-diagram.md) · [testing](testing.md) · TODO [location-master](../../../../task/todo/location-master.md) · flow [location-master-flow](../../../../diagram/location-master-flow.md)

## Decisions (SA-LM-*)

| ID | Decision |
|---|---|
| SA-LM-01 | One table `partner.location` (id, name, active, audit columns, version). Name trimmed, 1–40 chars (the documents' `location` columns are `varchar(40)`), unique ignoring case (`lower(name)` unique index). |
| SA-LM-02 | tRPC router `locationMaster` with `list / get / create / update / delete`, gated by the existing auth catalog leaf `location-master` (VIEW / ADD / EDIT / DELETE). `MasterMenu` gains `"location-master"`. Mutations need CSRF like every master mutation. Optimistic `expectedVersion` on update / delete. |
| SA-LM-03 | Documents keep **the name as text** in their existing `location varchar(40)` columns — no foreign key, no change to document tables. A renamed or deleted location never changes a saved document (the same snapshot rule as party names). |
| SA-LM-04 | `purchaseOrder.options` and `purchase.options` gain `locations: string[]` (active names, `name ASC`, bounded to 500). No separate options procedure, so document users need no `location-master:VIEW`. |
| SA-LM-05 | Purchase Order and Purchase **manual** lines: on create / update, a non-empty `location` must equal (ignoring case, then stored as the master's spelling) an **active** master name, unless it equals the value already stored on that line (an old typed or deactivated name may stay). Otherwise `<DOC>_VALIDATION` with field error `lines.{i}.location` code `unknown_location`. Lines copied from Memo Stock / a PO keep their copied location and are not checked. Quotation, Reserve, Memo Out, Memo Return, Memo Out Return and Memo Receive are unchanged (their location comes from stock or is always `Memo`). |
| SA-LM-06 | Delete is a hard delete (nothing references the row; SA-LM-03). Inactive is the soft option (Q-LM-01/02). |
| SA-LM-07 | Migration `20261116090000_location_master`: creates the table and, once, inserts the distinct trimmed non-empty `location` values (≤ 40 chars, first spelling per lower-case name) from `purchase_order_line` and `purchase_line` (Q-LM-03). `Memo` is not inserted (Q-LM-04). Rollback: drop the table; documents are untouched. |
| SA-LM-08 | List search: `name ILIKE %q%` (q ≤ 100), keyset paging by `(lower(name), id)` like Stone Master, page ≤ 50. |

## Authorization

| Operation | Grant | Notes |
|---|---|---|
| `locationMaster.list / get` | `location-master:VIEW` | Super Admin passes |
| `create` | `location-master:ADD` + CSRF | |
| `update` | `location-master:EDIT` + CSRF | |
| `delete` | `location-master:DELETE` + CSRF | |
| `purchaseOrder.options`, `purchase.options` (`locations`) | the document's existing VIEW | names only, no ids or audit data |

PRINT is a client action on data the user may already VIEW.

## Errors

| Code | HTTP / tRPC | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 / BAD_REQUEST, field errors `name: too_small / too_big` | create / update |
| `LOCATION_NAME_TAKEN` | 409 / CONFLICT, field error `name: duplicate` | create / update |
| `LOCATION_NOT_FOUND` | 404 / NOT_FOUND | get / update / delete of a missing id |
| `LOCATION_CHANGED` | 409 / CONFLICT | `expectedUpdatedAt` stale (update / delete) |
| `VALIDATION_ERROR` with `lines.{i}.location: unknown_location` | 400 | Purchase Order / Purchase save (SA-LM-05) |
| `PARTNER_UNAVAILABLE` | 503 | database errors (existing mapping) |

A duplicate name is pre-checked case-insensitively and also caught by the unique index (P2002 on `location_name_lower_key` → `LOCATION_NAME_TAKEN`), so two concurrent creates cannot both win. Optimistic locking uses `updatedAt`, like the other masters (implementation note 2026-11-16).

## Capacity

One small table (expected < 500 rows), primary-key and unique-index reads, options bounded to 500 names (~20 KB worst case) inside calls the documents already make. No new pool, cache, job or container; the 4 GB / 2 vCPU budget is unchanged.

## Dependencies

None new (Prisma, zod, tRPC already installed). [tech-stack](../../../../adr/tech-stack.md) unchanged.
