# Frontend conventions: vendor

- Feature ID / UI revision: `vendor` / 1
- Sources: [ui-spec.md](ui-spec.md) (pending review); [frontend architecture](../architecture.md); pattern: [customer conventions](../customer/conventions.md)

## Paths and ownership

| Path (proposed) | Purpose | Scope / owner |
|---|---|---|
| `frontend/src/app/setup/vendor/page.tsx` | Route `/setup/vendor`, `AppShell` with breadcrumbs `[Home, Setup, Vendor]` | frontend-feature (new route) |
| `frontend/src/features/vendor/**` | Vendor page, schema, hooks, API adapter, access helper | frontend-feature (new) |
| `frontend/src/features/partner/**` (new) | Partner Master components shared by customer and vendor (FE-VEN-001) | frontend-feature; claimed together with `features/customer/**` for that change |
| `frontend/src/features/customer/**` | Switch to the shared partner components; no behavior change | frontend-feature (customer); cross-scope claim |
| `frontend/src/features/setup/setup-tabs.tsx` | Add the "Vendor" tab | frontend-feature (`setup`) |
| `frontend/src/features/home/navigation.ts` | Sidebar Partner Master › Vendor → `/setup/vendor`; `navigationGroups` Vendor `href` for Home shortcuts | `frontend-home`; cross-scope handoff |
| `frontend/src/app/globals.css`, `package.json`, lockfile, providers | **No change expected** | integration-owned |

The gateway's dashboard shortcut list (`backend-api-gateway/src/trpc/router.ts`, `{ label: "Vendor", slug: "vendor" }`)
needs `href: "/setup/vendor"` like Customer's; that is a backend item (BE side of SA-VEN-06).

## Extraction from customer

Copying the customer components is not allowed, and they are typed to `CustomerFormValues`. FE-VEN-001 moves the
parts both pages need into `frontend/src/features/partner/` and makes them generic. Customer keeps its look and
behavior; its imports change.

| From `features/customer/` | To `features/partner/` | Made generic by |
|---|---|---|
| `components/address-item.tsx` | `components/address-item.tsx` | form type parameter (values with address arrays), `addressTypes` config (label, field names, Tax ID shown), `layout: "split" \| "wide"`, `idPrefix` |
| `components/address-list-card.tsx` | `components/address-list-card.tsx` | same config; `fullWidth` |
| `components/customer-information-card.tsx` | `components/partner-information-card.tsx` | `title`, `idPrefix`, phone `required` flag (Q-VEN-02) |
| `components/customer-page-header.tsx` | `components/partner-page-header.tsx` | `labels` (`{ singular, plural }`) |
| `components/customers-drawer.tsx` | `components/partner-drawer.tsx` | `labels`, list hook and cache passed in (customer and vendor queries stay in their own features) |
| `components/delete-customer-dialog.tsx`, `discard-changes-dialog.tsx` | `components/delete-partner-dialog.tsx`, `discard-changes-dialog.tsx` | `labels` |
| `components/customer-print-view.tsx` + `customer-print.module.css` | `components/partner-print-view.tsx` + module CSS | `labels`, address types |
| `schema.ts` (address and phone building blocks) | `schema.ts` | address/item schema factories; customer and vendor build their own form schema from them |
| `access.ts` (`can(mine, key, action)`) | `access.ts` | menu key argument (`"customer"` / `"vendor"`) |

Stays per entity: `contract.ts`, `api.ts` (contract mappers and domain-error mapping), `hooks.ts` (tRPC calls),
`<entity>-page.tsx` (state machine wiring), `schema.ts` (final form schema).

If the owner prefers not to touch the customer feature now, the fallback is to build Vendor first with the
shared module and move Customer onto it in a separate follow-up; the shared module must not depend on
customer code either way.

## Components and state

Same as customer: TypeScript strict, named exports, kebab-case files, `"use client"` page; RHF + Zod
(`mode: "onBlur"`, `reValidateMode: "onChange"`, manual focus of the first error after expanding items);
one `useFieldArray` `invoiceAddresses` (`keyName: "fieldKey"`); TanStack Query via `trpc.vendor.*`; form reset
only on selection change, save, Refresh or Duplicate; local UI state only for selection, drawer, expanded
items, search, dialogs, toasts; permissions through `permission.mine` with menu key `vendor`; print with
`print:` utilities; dates formatted after mount; semantic HTML (`<form noValidate>`, `<fieldset>`, `<aside>`).

## Delivery

- UI TODO: [document/task/todo/vendor.md](../../../task/todo/vendor.md)
- Dependencies: [dependencies.md](dependencies.md) (none new)
- Required SA contracts: [data-fetching.md](data-fetching.md#requirements-for-the-sa-bundle); handoff [vendor-sa.md](../../../coordination/handoffs/vendor-sa.md)
- Acceptance: [testing.md](testing.md)
- Completion evidence: `document/task/done/YYYY-MM-DD-vendor.md`
