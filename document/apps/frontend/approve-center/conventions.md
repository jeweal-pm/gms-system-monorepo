# Frontend conventions: approve-center

- Feature ID / UI revision: `approve-center` / 1 (approved 2026-11-07)
- Source / architecture guide: [ui-spec.md](ui-spec.md), [architecture.md](../architecture.md)

## Paths and ownership

| Path | Purpose | Owner |
|---|---|---|
| `frontend/src/app/(app)/approve/page.tsx` | redirect to the first menu (Q-AP-04) | frontend |
| `frontend/src/app/(app)/approve/[menu]/page.tsx` | menu page inside `TabPage` | frontend |
| `frontend/src/features/approve-center/menus.ts` | menu registry: slug, label, icon, catalog leaf, party, availability (`available` / `off` / `not-available`), per-menu adapter | frontend |
| `frontend/src/features/approve-center/api.ts` | per-document adapters (list pending, get version, approve) normalised to one `ApprovalRow` | frontend |
| `frontend/src/features/approve-center/use-approval-counts.ts` | counts for the panel and the sidebar badge | frontend |
| `frontend/src/features/approve-center/components/*` | `ApprovePanel`, `ApprovalTable`, cells, `BulkBar`, `ApprovalEmptyState` | frontend |
| `frontend/src/features/approve-center/fixtures.ts` | test fixtures matching source 02 (tests only, never rendered in production) | frontend |
| `frontend/src/features/home/navigation.ts`, `sidebar.tsx` | `approveLink` href/activePrefix, total badge slot | frontend (shared nav file; one active editor) |
| `frontend/src/app/globals.css` | three proposed tokens | frontend |
| `frontend/test/approve-center/**` | unit + integration tests | frontend |

No manifest, lockfile, provider, proxy or Docker change. `navigation.ts` is shared with other features: edit it in one serial change.

## Components and state

- Client components (`"use client"`) like the other document pages; no server data in UI stores.
- Server state: TanStack Query via the existing typed tRPC client (`trpc.master.<doc>.list/get/approve`).
- Local state: search text (debounced), sort, selection (`Set<id>` scoped to menu + search + sort), bulk progress.
- One `ApprovalRow` shape for every menu: `{ id, menu, docNo, docDate, dueDate, partyName, lineCount?, stoneNames?, totalPcs?, totalWeightCt?, grandTotal, currency, submittedBy?, submittedRole?, submittedAt?, version? }`. Optional fields render "—" until SA-AP-02.
- Semantic `<table>` with `<th scope="col">`, `aria-sort` on sortable headers; checkbox labels "Select {docNo}" / "Select all"; disabled buttons use `aria-disabled` + tooltip text reachable by keyboard focus.
- Dates: Asia/Bangkok; `dd/mm/yy` for doc dates (design), `dd/mm/yyyy HH:mm` for submitted time. Numbers: Decimal Setup places (ADR-0040).

## Delivery

TODO [task/todo/approve-center.md](../../../task/todo/approve-center.md); packages [dependencies.md](dependencies.md) (none); SA request [approve-center-sa.md](../../../coordination/handoffs/approve-center-sa.md); tests [testing.md](testing.md). Completion evidence under `document/task/done/`.
