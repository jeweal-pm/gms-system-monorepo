# Data fetching: stone-master (UI revision 1)

**No contract exists yet.** Every row below is `requires-sa`. The proposed shapes are in the [SA proposal](../../backend/partner/stone-master/decisions.md). Client: typed tRPC (`AppRouter`) + TanStack Query, same as vendor.

| UI need | Procedure (proposed) | Input → output | Cache / bounds | Permission |
|---|---|---|---|---|
| Access, buttons | `permission.mine` (existing) | — → `{isSuperAdmin, permissions}` | shared, 30 s | — |
| Drawer list + search | `stoneMaster.<kind>.list` | `{search?, cursor?, limit≤50}` → `{items[], nextCursor, total}` | infinite query; search debounced 300 ms; ≤ 100 chars | `stone-master:VIEW` |
| Open a record | `stoneMaster.<kind>.get` | `{id}` → record | per id | VIEW |
| Create | `stoneMaster.<kind>.create` | record fields → `{id, updatedAt}` | invalidates list | ADD |
| Update | `stoneMaster.<kind>.update` | `{id, expectedUpdatedAt, …fields}` → `{id, updatedAt}` | invalidates list + get | EDIT |
| Delete | `stoneMaster.<kind>.delete` | `{id}` → `{ok:true}` | invalidates list | DELETE |
| Select options (Stone Group on Stone Name; Sizes on Shape; all parts on Stone Code) | `stoneMaster.options` | `{kinds[]}` → `{group?:[], size?:[], shape?:[{…, sizeIds}], color?:[], cutting?:[], clarity?:[], quality?:[], stoneName?:[]}`, each item `{id, code, name, active}` | staleTime 60 s; ≤ 1,000 per kind | VIEW |

- `<kind>` ∈ `group, stoneName, size, shape, color, cutting, clarity, quality, stoneCode`.
- Options return active items. The record being edited also returns its own selected inactive items, so they can be displayed.
- **Record shapes:**
  - simple: `{id, code, name, active, updatedAt}`
  - stoneName: simple + `groupId, hsn`
  - shape: simple + `sizeIds[]`
  - stoneCode: `{id, code, mode, parts:{stoneNameId, sizeId?, shapeId, colorId, cuttingId?, clarityId?, qualityId?}, partOrder[7], active, updatedAt}`
- List rows carry the display data needed for the secondary line: group code/name for Stone Name, size count for Shape, stone name for Stone Code.
- Auto-code preview is computed in the browser from the option codes; the server rebuilds it on save.

## Requirements for the SA bundle

1. Owner service, schema and tables (no new container, 8 GB host).
2. Code uniqueness and format (Q-SM-01/06); HSN rule (Q-SM-07).
3. Permission model (Q-SM-04).
4. Stone Code: parts, size-in-shape rule, order, Auto build and snapshot (Q-SM-03/05).
5. Delete-in-use rule (Q-SM-08); list order (Q-SM-09); optimistic concurrency.
6. Gateway procedures and error codes; bounds for list/options.
