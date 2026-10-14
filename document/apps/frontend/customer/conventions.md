# Frontend conventions: customer

- Feature ID / UI revision: `customer` / 1
- Approved source / architecture guide: [ADR-0018](../../../adr/0018-customer-master-partner-service.md) (Accepted rev 1); UI bundle pending review: [ui-spec.md](ui-spec.md); [frontend architecture](../architecture.md); pattern: [user-permission conventions](../user-permission/conventions.md)

## Paths and ownership

| Path (proposed) | Purpose | Scope / owner |
|---|---|---|
| `frontend/src/app/setup/customer/page.tsx` | Route `/setup/customer` (ADR-0018 §5), `AppShell` with breadcrumb `Home › Setup › Customer`; same shape as `app/setup/user-permission/page.tsx` | frontend-feature (new route) |
| `frontend/src/features/customer/**` | Page, cards, address list/items, drawer, print view, schema, hooks, API adapter | frontend-feature (new) |
| `frontend/src/features/setup/setup-tabs.tsx` | Add the "Customer" tab | frontend-feature (`setup`); one-line change |
| `frontend/src/components/ui/**` (new) | Shared primitives promoted from user-permission (FE-CUS-001) | **new shared scope**; parent claims it and serializes, because user-permission imports change too. Proposed `ownership.yaml` scope name: `frontend-shared-ui` |
| `frontend/src/lib/phone.ts`, `frontend/src/lib/trpc-error.ts` (new) | Shared non-UI helpers promoted from user-permission | `integration-frontend-shared` (integration-owned, parent serializes) |
| `frontend/src/features/user-permission/**` | Import-path updates only (FE-CUS-001), no behavior change | frontend-feature; needs the parent's scope claim for that feature |
| `frontend/src/features/home/navigation.ts`, `app-shell.tsx` | Sidebar Partner Master › Customer → `/setup/customer` (FE-CUS-003) | `frontend-home`; cross-scope handoff |
| `frontend/src/app/globals.css` | 4 new tokens (FE-CUS-016) | shared; parent serializes |
| `frontend/package.json`, `pnpm-lock.yaml`, `frontend/src/providers/**`, `frontend/src/app/api/**` | **No change expected** (tRPC types come from the existing `@gem-crm/backend-api-gateway` workspace import once backend adds `customer.*`) | integration-owned |

### Shared primitives: reuse and promotion

The user-permission primitives are feature-local today. Importing them from `@/features/user-permission/...`
would couple two features, and copying is not allowed. FE-CUS-001 therefore **moves** them unchanged
(except the additions listed) to shared locations and updates user-permission's imports in the same change.

| From `frontend/src/features/user-permission/` | To | Additions for customer |
|---|---|---|
| `components/ui/button.tsx` (`Button`, `IconButton`, `cx`, `focusRing`) | `frontend/src/components/ui/button.tsx` | `IconButton`: `aria-disabled` mode with a visible tooltip (Excel) |
| `components/ui/card.tsx` (`Card`, `CountBadge`) | `frontend/src/components/ui/card.tsx` | `Badge` with variants `default`, `draft`, `inactive` |
| `components/ui/outlined-field.tsx` (`FieldShell`, `TextField`, classes) | `frontend/src/components/ui/outlined-field.tsx` | disabled state |
| — | `frontend/src/components/ui/select-field.tsx` (new) | `SelectField` (C-08) |
| `components/ui/phone-field.tsx` | `frontend/src/components/ui/phone-field.tsx` | `required` already optional — no change |
| `components/ui/switch.tsx` | `frontend/src/components/ui/switch.tsx` | none |
| `components/ui/checkbox.tsx` (`TriStateCheckbox`, `ReadOnlyCheck`) | `frontend/src/components/ui/checkbox.tsx` (move the `CheckState` type into it) | `LabeledCheckbox` |
| `components/ui/confirm-dialog.tsx` | `frontend/src/components/ui/confirm-dialog.tsx` | none |
| `components/ui/toast.tsx` (`ToastProvider`, `useToast`) | `frontend/src/components/ui/toast.tsx` | none |
| `components/ui/multi-select.tsx` | stays in user-permission (not used here) | — |
| `phone.ts` | `frontend/src/lib/phone.ts` | none |
| `api.ts`: `readDomainError`, `isCallerLicenseCode`, `retryTransient`, `DomainErrorInfo` | `frontend/src/lib/trpc-error.ts` | none; user-permission's `api.ts` re-imports them |

Not promoted: `UsersDrawer`, `PageHeader`, `AccessGuard`. The customer versions follow the same structure
but have different content; extracting a generic drawer shell is a later refactor and not part of this TODO.

## Components and state

- TypeScript strict, named exports, kebab-case filenames, `"use client"` for the interactive page, matching user-permission.
- Proposed feature files: `customer-page.tsx` (guard + workspace), `components/customer-page-header.tsx`, `components/customer-information-card.tsx`, `components/address-list-card.tsx`, `components/address-item.tsx`, `components/customers-drawer.tsx`, `components/delete-customer-dialog.tsx`, `components/discard-changes-dialog.tsx`, `components/customer-print-view.tsx`, `schema.ts`, `api.ts` (contract types + mappers + error mapping), `hooks.ts`, `access.ts` (permission helpers).
- Form: `react-hook-form` + `zod` via `@hookform/resolvers/zod`; `mode: "onBlur"`, `reValidateMode: "onChange"`, `shouldFocusError` off (focus is handled manually so collapsed items can be expanded first). Two `useFieldArray`s: `invoiceAddresses`, `shippingAddresses` (`keyName: "fieldKey"` so the server `id` field is kept). The final contract shape is mapped in `api.ts`.
- Default-address invariant is enforced in the change handler (setting one default clears the others in that array), not by validation alone.
- Server state: TanStack Query through the typed tRPC client (`trpc.customer.*`). No server data copied into local stores; no Zustand.
- Form reset happens only when the selection changes, after a successful save/create, after Refresh, or after Duplicate — never on a background refetch, so typing is not overwritten.
- Local UI state: selection (`null` = draft), drawer open (optionally `localStorage`, try/catch), expanded item keys, search text, dialogs, toasts.
- Permissions: `permission.mine` (existing, approved contract). `access.ts` exports `can(mine, "customer", action)`: true when `permissions === "ALL"` or it contains `customer:{ACTION}`.
- Print: Tailwind `print:` variant only. The workspace root and `AppShell` regions get `print:hidden` through the page wrapper (no `AppShell` change; the page renders a sibling `CustomerPrintView` with `hidden print:block`). If `AppShell` regions cannot be hidden from the page, a scoped `@media print` rule in the feature (CSS module) is the fallback; no `globals.css` change.
- Hydration: dates in the print view are formatted after mount. No `Date.now()`/random IDs in render (use `useId`).
- Semantic HTML: `<form noValidate>`, `<fieldset>`/`<legend>` per address item, `<aside>` drawer, `<dialog>` confirmations, `<button type="button">` for every non-submit action.

## Delivery

- UI TODO: [document/task/todo/customer.md](../../../task/todo/customer.md)
- Dependencies: [dependencies.md](dependencies.md) (none new)
- Required SA contracts: ADR-0018 + the pending SA bundle (`document/apps/backend/partner/customer/`); needs listed in [data-fetching.md](data-fetching.md#requirements-for-the-sa-bundle)
- Acceptance: [testing.md](testing.md)
- Completion evidence: `document/task/done/YYYY-MM-DD-customer.md` (after implementation)
