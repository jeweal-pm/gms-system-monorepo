# Frontend conventions: company-profile

- Feature ID / UI revision: `company-profile` / 1 (pending-review)
- Approved source / architecture guide: [ui-spec.md](ui-spec.md), [architecture](../architecture.md)

## Paths and ownership

| Path | Purpose | Scope |
|---|---|---|
| `frontend/src/app/setup/company-profile/page.tsx` | Route in `AppShell` with breadcrumbs | frontend-feature `setup` |
| `frontend/src/features/company-profile/company-profile-page.tsx` | Page: modes, form, header wiring | frontend-feature `company-profile` (new) |
| `frontend/src/features/company-profile/schema.ts` | Zod form schema and form ↔ API mapping | same |
| `frontend/src/features/company-profile/api.ts`, `hooks.ts` | tRPC calls and error mapping (after SA approval) | same |
| `frontend/src/features/company-profile/components/{profile-section,logo-upload-tile,rich-text-field}.tsx` | New components | same |
| `frontend/src/features/setup/setup-destinations.ts`, `frontend/src/features/home/navigation.ts` | Company Profile tile → `/setup/company-profile`; remove the placeholder entry | app-navigation files (serial edit) |
| `frontend/package.json`, `pnpm-lock.yaml` | Only if DEP-CP-01 is approved | **integration-owned** |

Reuse `components/ui/*` (TextField, SelectField, PhoneField, LabeledCheckbox, Button, IconButton, ConfirmDialog, toast) and the partner pieces (`PartnerPageHeader`, `DiscardChangesDialog`, address pattern). If a partner component needs a new prop, extend it there rather than copying it.

## Components and state

- Client component page (as the other setup pages). Form state uses react-hook-form with a Zod resolver; server state uses TanStack Query via tRPC, with no duplicate store.
- The logo file is held in form state as `{ kind: "unchanged" } | { kind: "new", file } | { kind: "removed" }`. A preview uses `URL.createObjectURL`, which is revoked on change or unmount.
- The editor value is held as the agreed storage format (HTML or Markdown, per Q-CP-05 and SA). The editor component loads on the client only (Tiptap needs `immediatelyRender: false` in the Next.js App Router).
- Deterministic hydration: the page renders only inside `AppShell` after the session check. No dates are rendered.

## Delivery

Central TODO: [company-profile](../../../task/todo/company-profile.md). Data wiring follows the SA bundle requested in the [handoff](../../../coordination/handoffs/company-profile-sa.md). Tests: [testing.md](testing.md).
