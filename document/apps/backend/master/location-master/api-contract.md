# Location Master — API contract (SA revision 1, approved 2026-11-16)

tRPC at `/api/master/trpc`, router `locationMaster`. Consumers: TODO FE-LM-001…004 ([location-master](../../../../task/todo/location-master.md)).

```ts
// Optimistic locking uses `updatedAt` as the version, like the other masters (Currency, Stone Master).
type Location = { id: string; name: string; active: boolean; createdAt: string; updatedAt: string };

// queries — location-master:VIEW
locationMaster.list(input: { q?: string /* ≤100, trimmed */; active?: boolean; cursor?: string | null /* ≤400: a 40-char Thai name encodes past 200 */; direction?: "forward" | "backward"; limit?: number /* 1..50, default 50 */ })
  => { items: Pick<Location, "id" | "name" | "active">[]; nextCursor: string | null; total: number }
locationMaster.get(input: { id: string /* uuid */ }) => Location

// mutations — CSRF + location-master:ADD / EDIT / DELETE
locationMaster.create(input: { name: string /* trimmed 1..40 */; active?: boolean /* default true */ }) => Location
locationMaster.update(input: { id: string; expectedUpdatedAt: string /* ISO */; name: string; active: boolean }) => Location
locationMaster.delete(input: { id: string; expectedUpdatedAt: string /* ISO */ }) => { id: string }
```

Inputs are strict zod objects (unknown keys refused). Errors: see [architecture § Errors](architecture.md#errors).

| Domain code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | input shape; field errors by path (`name` `too_small` / `too_big`) |
| `LOCATION_NAME_TAKEN` | 409 | name already used (case-insensitive); field error `name` / `duplicate` |
| `LOCATION_CHANGED` | 409 | `expectedUpdatedAt` differs from the stored row |
| `LOCATION_NOT_FOUND` | 404 | id not found |
| `PERMISSION_DENIED` / `CSRF_INVALID` | 403 | as every master |

_Implementation note (2026-11-16): the revision first said `version` / `expectedVersion` and a `LOCATION_VALIDATION taken` field error; the build follows the other masters (`updatedAt`, `LOCATION_NAME_TAKEN`). The frontend uses this contract._

## Changes to existing contracts (additive)

```ts
purchaseOrder.options(...) => { ...existing, locations: string[] /* active names, name ASC, ≤ 500 */ }
purchase.options(...)      => { ...existing, locations: string[] }
```

`purchaseOrder.create / update` and `purchase.create / update`: `lines[i].location` (unchanged type, string ≤ 40) is now checked on manual lines (SA-LM-05); a refused value returns the document's existing `*_VALIDATION` with field error `lines.{i}.location` / `unknown_location`. Older clients that send a stored value are unaffected.
