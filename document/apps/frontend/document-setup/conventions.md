# Frontend conventions: document-setup

- Feature ID / UI revision: `document-setup` / 1 (pending-review)
- Source / architecture: [ui-spec.md](ui-spec.md), [frontend architecture](../architecture.md)

## Paths and ownership

| Path | Purpose |
|---|---|
| `frontend/src/app/setup/document-setup/page.tsx` | route (new) |
| `frontend/src/features/document-setup/**` | page, form, numbering table, drawer, schema, api adapter, hooks |
| `frontend/src/features/setup/setup-destinations.ts` | Setup tile → `/setup/document-setup` and permission `document-setup` (shared; serialize) |
| `frontend/src/features/home/navigation.ts` | real-page href + catalog key (shared; serialize) |
| `frontend/test/document-setup/**` | tests |

Reuse `@/components/ui/*`, `@/lib/drawer-layout`, partner page parts (header, drawer toggle, discard dialog, access guard). No manifest or lockfile change.

## Components and state

- Client component page; react-hook-form + Zod 4 with `useFieldArray` for rows; TanStack Query through the typed master tRPC client once SA delivers.
- Rows keep a stable client `key` (not the array index) so re-sorting by Date keeps focus and errors with the right row.
- Example column is derived (`useWatch`), never stored.
- Controlled vs registered inputs: a field shown both read-only and editable uses one approach or separate `key`s (lesson from user-permission).

## Delivery

Central TODO: [document-setup](../../../task/todo/document-setup.md). Backend contract: requires-sa. Tests: [testing.md](testing.md).
