# 2026-10-19 Stone Master (9 pages + API)

Owner: "อนุมัติ stone-master UI rev 1 และ SA rev 1" (Q-SM-01…09 use the defaults). Later: "แยก shcema stone แทนได้มั้ย …" → the tables live in their own PostgreSQL schema `stone`. Scope: [UI spec](../apps/frontend/stone-master/ui-spec.md), [SA decisions](../apps/backend/partner/stone-master/decisions.md), [ADR-0024](../adr/0024-stone-master-in-partner-service.md), [TODO](../task/todo/stone-master.md).

## Backend: partner

- Prisma: datasource schemas `partner` + `stone`. Ten tables in `stone`:
  - `stone_group`, `stone_size`, `stone_color`, `stone_cutting`, `stone_clarity`, `stone_quality`
  - `stone_name` (FK group), `stone_shape`, `stone_shape_size`
  - `stone_code` (7 part FKs, `part_order`)
  - Every FK is RESTRICT, except `shape_size → shape`, which is CASCADE.
- Migration `20261019090000_stone_master`:
  - `CREATE SCHEMA IF NOT EXISTS "stone"` and the tables (generated with `prisma migrate diff`).
  - CHECK constraints: code format (uppercase), HSN 4–8 digits, `part_order` is a permutation of the seven parts.
  - Applied in dev; no drift remains.
- Module `src/stone-master/`:
  - `kinds`, `schemas`, `stone-code` (auto code), `errors`, `service`, `controller` at `internal/v1/stone-master/{options | :kind | :kind/:id}`.
  - Rules:
    - Codes are uppercase and unique per table.
    - A new reference must be active; a stored reference that is now inactive may stay.
    - The size must be available on the shape.
    - In Auto mode the server builds the code; it is a snapshot.
    - Optimistic version via `expectedUpdatedAt`.
    - Deleting a referenced record is blocked (`STONE_MASTER_IN_USE`).
  - Search: code and name; Stone Name also HSN and group code; Stone Code also stone name.
  - Lists: keyset by code, ≤ 50 per page. Options: ≤ 1,000 per kind, plus up to 20 `include` ids.
- `common/persistence.ts`: `prismaCode` exported. `common/errors.ts`: the STONE_MASTER_* messages.

## Backend: gateway

- `trpc/stone-master-schemas.ts`: strict inputs and validated outputs.
- `router.ts`:
  - `stoneMaster.options`.
  - `stoneMaster.{group,size,color,cutting,clarity,quality,stoneName,shape,stoneCode}.{list,get,create,update,delete}` from one router factory.
  - Each procedure uses `permittedProcedure("stone-master", VIEW | ADD | EDIT | DELETE)`.
- `trpc/partner-client.ts`: partner **422** now maps to `UNPROCESSABLE_CONTENT` and keeps the upstream code (`STONE_MASTER_REFERENCE_INVALID`). Before this, any 422 became INTERNAL_SERVER_ERROR.

## Frontend

- **Routes:** `/setup/stone-master` redirects to `stone-group`. `/setup/stone-master/[page]` serves the 9 slugs; any other slug is 404.
- **Feature `features/stone-master/`:**
  - `kinds.ts`: page config.
  - `stone-code.ts`: parts, auto code, `moveItem`.
  - `schema.ts`: one form shape with rules per page.
  - `api.ts`: mapping, row text, size-in-shape helpers, error copy.
  - `hooks.ts`: generic `stoneMaster.<kind>` hooks.
  - `stone-master-page.tsx`: shared workspace with the partner modes, permissions, drawer, discard/delete dialogs and print.
  - `components/stone-fields-card.tsx`, `part-order-list.tsx` (drag with pointer + ArrowUp/Down, live announcement), `stone-print-view.tsx`.
- **Reuse:**
  - The Partner header, drawer, guard and dialogs take the existing `PartnerEntity` labels with key `stone-master`, so no rename was needed.
  - `PartnerDrawer` gains optional `rowText` and `searchPlaceholder`; the defaults are unchanged for vendor/customer.
  - `partnerDrawerId` turns spaces into "-", because "stone groups" would break `aria-controls`.
  - `MultiSelect` moved to `components/ui/` with a `placeholder` prop; user-permission imports it from there and its text is unchanged.
- **Navigation:**
  - The Setup context panel has a **Stone Master** group with the 9 pages, each needing `stone-master:VIEW`.
  - The Master Code tile "Stone Master" opens Stone Group.
  - The Home "Stone Master" shortcuts point to the real pages.
- **Deviations from conventions.md:**
  - The context-group chevron is decorative, as on Partner master (the group row is a link). It is not a collapsible disclosure.
  - `PartnerEntity` was reused instead of creating `MasterEntity`.

## Dev environment

- `docker-compose.dev.yml` (dev override only): partner `NODE_OPTIONS=--max-old-space-size=768` and a 1G memory limit.
  - Reason: `nest start --watch` ran out of heap type-checking the larger Prisma client at 512M.
  - Production is unchanged: it compiles at image build, and runtime keeps 512M.

## Checks

- **Partner:** 271 pass / 15 skipped (new UT-SM-P01…P19), lint clean.
- **Gateway:** 234 pass / 7 skipped (new UT-SM-G01…G09), typecheck and lint clean.
- **Frontend:** 289 pass (new UT-SM-01…09), typecheck clean, lint 0 errors (2 old warnings).
- **Live through `localhost:3000` as the dev Super Admin.** 18/18 checks pass, all test data removed:
  - create group, shape (sizes), stone name and stone codes in AUTO (`TRB…-T1.0…-TRD…-TD…-TEX…-TV…-TQ…`) and MANUAL
  - CODE_TAKEN (any case)
  - REFERENCE_INVALID for a size not on the shape and for a new inactive group
  - an unchanged inactive group allowed
  - CHANGED (stale version), IN_USE on delete, NOT_FOUND after delete
  - search by HSN and by stone name, `sizeCount`, options with `sizeIds`
- **Pages after restarting the frontend:**
  - all 9 routes return 200; an unknown slug returns 404
  - `/setup/stone-master` returns 307 to `stone-group`
  - `/setup` returns 200
- **Not run:** browser/visual checks (drag-and-drop, multi-select, print), a delegated-user check, `next build`.

## Production rollout note

The partner DB role needs CREATE on the database for `CREATE SCHEMA "stone"`, or a DBA creates the schema first (SA-SM-01).

## Security review: passed (advisory)

Both reviewers checked the same source: HEAD 79dfe91 plus the working tree, hash 403639a6858cd27a.

- **sec-auditor: advisory.** All 46 procedures use the correct action, and inputs are strict so audit fields can't be set. Search and cursor can't inject; errors and logs expose nothing; there is no XSS.
  - Ticket [INV-20261019-001](../task/investigation/INV-20261019-001-stone-options-exceeds-gateway-response-cap.md): `options` can grow past the gateway's 1 MiB response cap within its own 1,000-row limit. The selects would then fail for everyone. An availability risk; an SA bound decision is needed.
- **security-auditor: advisory.** Agrees with 001.
  - Ticket [INV-20261019-002](../task/investigation/INV-20261019-002-stone-schema-production-bootstrap-least-privilege.md): `CREATE SCHEMA IF NOT EXISTS` may need database CREATE even when the schema already exists. Production `f1_partner` lacks it, so the production bootstrap needs an infra decision. Owner: infra.
- Both tickets are pending owner review. No fixes have been started.

## Follow-up (owner, same day)

- **Auto code format** ("format stone code auto code คือ xx-xxxxxx …"): the first two set parts are joined together, then one "-", then the rest without separators. Example: RUB + 1.0 + RD + D + EX → `RUB1.0-RDDEX`. With two parts or fewer there is no "-".
  - Changed in both partner and frontend `buildAutoCode`, plus SA-SM-05 and the UI spec.
  - Tests: partner 18 stone tests and frontend 289 pass. The live check returned `TRB…T1.0…-TRD…TD…TEX…TV…TQ…`, and the test data was removed.
- **Stone Code card overflow:** the card now grows with its content and the page scrolls; `min-h-0` was removed from the form and the card.
- **Context panel:** Stone pages show only the Stone Master group, and Partner pages only Partner master. The navigation now has two context navs.
- The owner renamed the nav label to "Stone Code".
- The dual security review was not re-run for these changes: a pure string-format function and CSS classes, with no boundary, input or permission change.

- **Animated drag and drop for Stone Code parts:** `motion` 14.0.0 was installed exact (owner 2026-10-19: "frontend หน้า stone code อยากได้ drag and drop คล้ายๆแบบนี้ https://21st.dev/…/reorder-list อยากได้ animation คล้ายๆแบบนี้", then chose "ใช้ motion 14.0.0 (Recommended)").
  - Behaviour: `Reorder` with a drag handle; the dragged row lifts (scale 1.02 + shadow) and the other rows spring into place.
  - Keyboard ArrowUp/ArrowDown and the screen-reader announcement are kept. `reducedMotion="user"` respects the OS setting.
  - Dev containers reinstalled with `pnpm docker:dev:install`; `pnpm install --frozen-lockfile` passes.
  - Checks: typecheck, lint 0 errors, 289 tests pass, and `/setup/stone-master/stone-code` returns 200 after restart. The browser drag was not checked by the agent.
