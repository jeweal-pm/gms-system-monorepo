# Frontend conventions: approval-setup

- UI revision: 1 (pending-review)
- Follows [frontend architecture](../architecture.md), [approve-center conventions](../approve-center/conventions.md) and the [UI delivery workflow](../../../workflow/ui-delivery.md).

## Paths and ownership

| Path | Use | Phase |
|---|---|---|
| `frontend/src/app/(app)/setup/approval/page.tsx` | route, `TabPage` with breadcrumbs Home › Setup › Approval | 1 |
| `frontend/src/features/approval-setup/model.ts` | pure rules: rows from `APPROVE_MENUS`, `DEFAULT_APPROVAL_SETTINGS`, chain/helper by state, waiting text and pluralisation, turn-off decision (`"blocked" | "confirm" | "check-failed" | "wait"`) | 1 |
| `frontend/src/features/approval-setup/api.ts` | count hooks (reuse approve-center `documentClients`, `listQueryKey`, `COUNT_INPUT`, VIEW-gated) | 1 |
| `frontend/src/features/approval-setup/components/*` | `ApprovalSetupPage`, `ApprovalSettingsTable`, `StatusChain`, `StatusChip`, `WaitingCell`, `TurnOffBlockedDialog` | 1 |
| `frontend/src/features/setup/setup-destinations.ts`, `setup-icons.tsx`, `setup-tile.tsx` | tile, icon, `emerald` color | 1 |
| `frontend/src/features/home/navigation.ts` | only if `approval-setup` must be added to `SETUP_MENU_KEYS`/catalog keys — **phase 2**, after the auth catalog has the leaf | 2 |
| `frontend/src/components/ui/confirm-dialog.tsx` | additive `confirmVariant` / rich body (shared; existing callers unchanged) | 1 |
| `frontend/src/app/globals.css` | 2 tokens | 1 |
| `frontend/src/features/approve-center/*` | **read/import only in phase 1**; phase 2 settings-driven availability (FE-AS-009) | 2 |
| `frontend/test/approval-setup/**`, `frontend/test/setup/**`, `frontend/test/components/confirm-dialog*` | tests | 1 |

Shared files (`globals.css`, `confirm-dialog.tsx`, `navigation.ts`) are edited by the single frontend owner of this scope; the task pointer and registry are parent-owned.

## Components and state

- Phase 1 settings are `useState<Record<ApproveMenuSlug, boolean>>(DEFAULT_APPROVAL_SETTINGS)` in `ApprovalSetupPage`; no global store, no `localStorage`, no query cache entry pretending to be server data.
- One source for rows: `APPROVE_MENUS` (label, icon, leaf, availability, slug). Do not duplicate labels or order.
- Pure decisions live in `model.ts` and are unit tested; components only wire them.
- The count hook must use the **same query key** as approve-center so caches are shared and invalidation after Approve updates this page.
- English UI text; plural rules in one helper (`documentsText(n)`).

## Delivery

- Phase 1 FE-AS-001…007 can start after the owner approves revision 1. Phase 2 FE-AS-008…011 wait for an approved SA bundle and backend completion.
- Tests per [automated testing](../../../workflow/automated-testing.md); security roles once on the final diff; manual-tester for the Setup → Approval journey.
