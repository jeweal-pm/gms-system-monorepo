# Frontend data flow: user-permission

- UI revision: 1
- Related shared/SA API contract: none yet. Requested in [SA handoff](../../../coordination/handoffs/user-permission-sa.md). Existing approved contracts that are reused: gateway tRPC `session.current`, `license.status` ([license API contract](../../backend/auth/license-integration/api-contract.md)).
- Backend requirement: **requires-sa** (every create/read/update/delete for users and permissions is new)

The operation names below are **placeholders** for SA to rename or redesign. They are not contracts.

| UI action / TODO ID | Existing or proposed operation | Input / output (UI need) | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Page guard / FE-UP-014 | Existing: `session.current`, `license.status` (unchanged). Proposed: page authorization (Q-UP-20) | → session user, license state; + whether the user may manage users | existing tRPC keys | existing AppShell skeleton; denied → proposal: "You don't have access" page state | auth/gateway (SA) |
| Drawer list + limit text / FE-UP-007 | proposed `userAdmin.list` | none → `{ items: [{ id, name, username, isSuperAdmin, active }], usage: { used, limit, superAdminExcluded } }`. Bounded: limit + 1 rows (currently ≤ 4); server must cap the size. | `['userAdmin','list']`; staleTime 30 s; refetch on Refresh | drawer skeleton (3 rows); error inline + Retry; empty = only the draft item | auth (SA) — licensing source C-03 |
| Select user / FE-UP-012 | proposed `userAdmin.get` | `{ id }` → profile fields + `permissions: string[]` (keys) | `['userAdmin','get',id]`; enabled only when an id is selected | form + matrix skeleton; 404 → toast error + return to draft | auth (SA) |
| Permission catalog / FE-UP-006 | proposed `permission.catalog` (or a static shared constant, as SA decides) | none → tree `[{ id, label, children?, actions: ('view'|'add'|'edit'|'delete'|'cancel'|'price')[] }]` + `applicableCount` (53?) | `['permission','catalog']`; staleTime ∞ for the session | matrix skeleton; error + Retry | SA (Q-UP-13) |
| Location options / FE-UP-004 | proposed `location.options` | none → `[{ id, label }]`, bounded | `['location','options']`; staleTime 5 min | listbox "Loading…"; error inline in listbox; empty "No locations" | SA (Q-UP-10) — Main/Sub Location services do not exist yet |
| Create User / FE-UP-012 | proposed `userAdmin.create` (mutation) | `{ username, password, name, phone: { country, number }, locationIds[], active, permissions[], photoId? }` → `{ id }`; password never echoed | invalidate `list`; set `get` cache for new id | button loading; field errors mapped from server; limit/licence errors → FormError | auth (SA) C-01/C-02/C-04 |
| Save (edit) / FE-UP-012 | proposed `userAdmin.update` | `{ id, …changed fields }` | invalidate `list`, `get(id)` | as above | auth (SA), Q-UP-14 |
| Delete / FE-UP-009 | proposed `userAdmin.delete` | `{ id }` → `{ ok }` | remove `get(id)`, invalidate `list` | dialog "Deleting..." (S4); error → keep dialog open + inline error | auth (SA) C-06 |
| Duplicate / FE-UP-008 | client-only from the loaded `get(sourceId)` (no server call), unless SA decides otherwise | copies `permissions` (+ "department"? Q-UP-03) into a new draft | none | toast success (S5) | frontend |
| Photo upload / FE-UP-013 | proposed REST multipart through the gateway (tRPC is not suited to binary data), or a presigned URL | file → `{ photoId, url }` | none | tile uploading/progress; error inline under the tile | SA + infra (storage) |
| Export Excel / Print / FE-UP-003 | proposed `userAdmin.export` (server-generated file) or client print view | unknown (Q-UP-16) | none | button loading; error toast | SA |

## Rules

- Use the existing typed tRPC client and TanStack Query provider (`frontend/src/providers/app-providers.tsx`). Never call internal services directly; Better Auth stays only for session operations.
- Bounds: the list is capped server-side (the limit is small). The catalog is a static size. Location options must be paginated or capped by SA.
- Mutations: block double-submit (button disabled while pending). Do not use optimistic updates for create/delete. After success, invalidate `list`.
- Race: when switching selected users quickly, render only the result for the current selection (the query key includes the id).
- No password is ever kept in query cache or logs. Clear the password field after a successful create or save.

## Independent work versus SA-dependent wiring

Before SA approval, frontend can build every component and state with **typed local fixtures** (a static
catalog subset from the screenshots, two sample users) behind a single `user-permission/api.ts`
adapter that is clearly marked as a fixture. The UI must not imply that anything was saved. The Create
button submits to a fixture that resolves a validation-only result, and success persistence stays
blocked. Replacement task: FE-UP-012 swaps the adapter for the approved tRPC procedures.
