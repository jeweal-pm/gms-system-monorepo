# Conventions: stone-master (UI revision 1)

## Files

```
frontend/src/app/setup/stone-master/page.tsx                 → redirect to stone-group
frontend/src/app/setup/stone-master/[page]/page.tsx          → one route, validates the slug (notFound otherwise)
frontend/src/features/stone-master/
  kinds.ts              page config: slug, kind, labels, placeholders, search hint, row text
  api.ts                contract → view models, error mapping
  hooks.ts              list/get/save/delete/options hooks per kind
  schema.ts             Zod form schemas (simple, stoneName, shape, stoneCode)
  stone-code.ts         part keys, default order, buildAutoCode(), moveItem()
  stone-master-page.tsx shared page (header, drawer, card, modes, permissions)
  components/simple-fields.tsx, stone-name-fields.tsx, shape-fields.tsx, stone-code-fields.tsx, part-order-list.tsx
```

## Reuse from Partner Master

- `features/partner/components/partner-page-header.tsx`, `partner-drawer.tsx`, `discard-changes-dialog.tsx`, `delete-partner-dialog.tsx` and `access.ts` take a `PartnerEntity` (labels).
  - Generalize the type to a neutral `MasterEntity` (singular/plural labels and button text) without changing vendor/customer behavior.
  - Stone Master passes its own entity per page.
  - Vendor/customer regression tests must stay green.
- Permission helper: `partnerAccess(mine, "stone-master")` (existing).
- The multi-select moves from `features/user-permission/components/ui/` to `components/ui/`, and user-permission imports it from there.

## Navigation

- `features/home/navigation.ts`:
  - The Setup context nav gets a **Stone Master** group with the 9 children, all with `permission: ["stone-master"]`.
  - The sidebar "Stone Master" section items point to the new routes (the slug `stone` becomes `stone-name`).
- `features/setup/setup-destinations.ts`: the "Stone Master" tile stops being a placeholder and links to `/setup/stone-master/stone-group`.

## Naming

- tRPC kind keys are camelCase (`stoneName`, `stoneCode`); slugs are kebab-case.
- UI copy is English, as in the design.
- Tests use the IDs UT-SM-*, and manual cases use TC-SM-*.
