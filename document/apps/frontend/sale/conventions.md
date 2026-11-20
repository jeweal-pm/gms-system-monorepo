# Frontend conventions: sale

- Feature ID / UI revision: `sale` / 1 (pending-review)
- Approved source / architecture guide: none approved yet; [ui-spec](ui-spec.md), [frontend architecture](../architecture.md)

## Paths and ownership

| Item | Path (proposed) | Pattern |
|---|---|---|
| Routes | `frontend/src/app/(app)/sale/sale/page.tsx`, `frontend/src/app/(app)/sale/sale/[id]/page.tsx` | As `(app)/pre-sale/reserve/**` |
| Page + config | `frontend/src/features/sale/components/SalePage.tsx` (`SalePage`, `EditSalePage`, `SALE_CONFIG`, daybook) | As `ReservePage.tsx` / `PurchasePage.tsx` |
| API adapter | `frontend/src/features/sale/api.ts` (`useSaleApi`, `useSaleDetail`, `useSaleDaybook`, `fromSale`, error mappers, `SALE_HREF`) | As `reserve/api.ts` |
| Form model | `frontend/src/features/sale/form.ts` (schema, `emptySale`, `toSaleInput`, `reserveLineToSaleLine`, source keys) | As `purchase/form.ts` |
| From Reserve picker | `frontend/src/features/sale/components/reserve-line-picker.tsx` | Thin picker on the shared shell, as `purchase-pickers.tsx` |
| Shared picker shell | move `purchase/components/purchase-picker.tsx` to `trade-document/stock-picker.tsx` (Purchase re-imports it) | FE-SL-001; a feature must not import another feature's components |
| Navigation | `frontend/src/features/home/navigation.ts` (`REAL_PAGE_HREFS.sale`) | Integration-owned shared file; one-line change, serialized through the parent |
| Approval type | `frontend/src/features/trade-document/flow-status.ts` (`DocumentApprovalType` + `APPROVAL_DOCUMENTS.sale`), approve-center registry | Shared; serialized |
| Line photos | `frontend/src/features/trade-document/document-photos.ts` (`DOCUMENT_PHOTOS.sale`) | Shared; only after SA-SL-09 |

No manifest, lockfile, provider, proxy or composition-root change is expected on the frontend.

## Components and state

- TypeScript, Tailwind tokens, existing exports. Client components (`"use client"`), as all document pages.
- Form state in react-hook-form + zod via `DocumentForm`; server state in TanStack Query through the typed tRPC client (or the inventory REST adapter if SA places Sale there, Q-SL-02). No server data in UI stores.
- Each line carries `source` (`RESERVE` | `STOCK` | phase 2 `OWN_STOCK`), its source id (`reserveLineId` or `memoStockId`) and its cap (open / pending pcs and weight) for the row panel limits.
- Semantic HTML, keyboard and focus behaviour as the shared form and pickers.

## Delivery

UI TODO [todo/sale.md](../../../task/todo/sale.md); SA requirement [handoff](../../../coordination/handoffs/sale-sa.md); tests [testing.md](testing.md). Completion evidence goes to `document/task/done/`.
