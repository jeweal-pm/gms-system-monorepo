# Frontend conventions: purchase

- Feature ID / UI revision: `purchase` / 1 (pending-review)
- Approved source / architecture guide: [ui-spec](ui-spec.md) (not yet approved), [frontend architecture](../architecture.md), [ADR-0033](../../../adr/0033-memo-documents-in-master-service.md) (shared trade-document pattern), [ADR-0037](../../../adr/0037-app-shell-tabs.md) (tabs)

## Paths and ownership

| Path | Purpose | Owner / scope |
|---|---|---|
| `frontend/src/app/(app)/purchase-order/purchase/page.tsx`, `[id]/page.tsx` | Routes in `TabPage`. Breadcrumb Home › Purchase Order › Purchase. | frontend-feature (new) |
| `frontend/src/features/purchase/api.ts` | Schema, form values ↔ contract mapping, `usePurchaseApi`, daybook/detail hooks, error mapping, `memoStockToPurchaseLine` | frontend-feature (new) |
| `frontend/src/features/purchase/components/PurchasePage.tsx` | `DocumentFormConfig` + `PurchasePage` / `EditPurchasePage` | frontend-feature (new) |
| `frontend/src/features/trade-document/document-form.tsx` | **Shared.** It gains an optional second item button. Its config has no picker today and holds the uncommitted confirm-modal change (2026-11-04), which must be committed or rebased first. | frontend; shared, so one writer at a time |
| `frontend/src/features/quotation/document-kind.tsx`, `components/items/ItemTable.tsx`, `ItemEditorPanel.tsx` | **Shared.** `DocumentKind.priceTitle` (default "Sale Price"). `ItemTable.tsx` also holds the uncommitted 2026-11-04 change. | frontend; shared |
| `frontend/src/features/home/navigation.ts` | `REAL_PAGE_HREFS.purchase` and an `activePrefix` sidebar link (FE-PU-006) | frontend |
| `frontend/test/purchase/**`, `frontend/test/trade-document/**` | Tests | frontend |

The auth catalog leaf `purchase` and the Document Setup key `purchase` (PU) already exist (C), so this work makes no auth change. `package.json`, the lockfile, providers, `src/app/api/**` and Docker files stay unchanged.

## Components and state

- Use TypeScript and the existing `DocumentForm` config pattern (as `MemoReturnPage.tsx`), and `VendorDocumentInfoForm` for the header.
- The table, panel, note, summary and rail come from Quotation through a Purchase `DocumentKind`.
- Form state lives in react-hook-form + Zod (C). Server state lives in TanStack Query through `masterTrpc` (C). No server data goes in UI stores.
- Number formatting uses `useNumberFormat()` (Decimal Setup, C). There are no hard-coded decimal places in the UI; the 3 dp input precision for weight stays as in the shared schema.
- The confirm dialogs use `useConfirm()` / `ConfirmDialog` (C). No `window.confirm`.
- Client components only, as the other document pages. Dates are formatted on the client after load, so hydration stays deterministic.

## Delivery

TODO: [todo/purchase.md](../../../task/todo/purchase.md). Dependencies: none new ([dependencies](dependencies.md)). SA handoff: [purchase-sa.md](../../../coordination/handoffs/purchase-sa.md). Tests: [testing](testing.md). Completion evidence goes under `document/task/done/`.
