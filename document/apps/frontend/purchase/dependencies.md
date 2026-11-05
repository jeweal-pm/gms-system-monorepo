# Frontend dependency decisions: purchase

- UI revision: 1 (pending-review)
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md). **No entry is added**, because nothing new is proposed.
- Status: **no additional packages**

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | — | — | — | — | 0 | — | — | — |

Everything is built from components that already exist in `frontend` (checked against the code on 2026-11-04):

- Page frame, header actions, item table, row panel, photo box, note, Summary Value and right rail: the shared `DocumentForm` (`features/trade-document/document-form.tsx`), with the Quotation components under `features/quotation/components/**`.
- Vendor header: `VendorDocumentInfoForm` (`features/trade-document/vendor-info-form.tsx`).
- Memo Stock dialog: `MemoStockModal` + `useMemoStock` (`features/trade-document/memo-stock-*`).
- Confirm dialogs: `useConfirm` / `ConfirmDialog`.
- Icons: `lucide-react` (installed) and the existing `ScanIcon` and `PurchaseIcon`.
- Forms and data: react-hook-form + Zod 4, TanStack Query 5 + tRPC 11 (installed, tech-stack).
- Tabs: `TabPage` (ADR-0037).

Backend: no new package is expected. The Purchase document reuses NestJS, Prisma and Zod in `backend-api-master`. Only if SA puts own stock in the proposed inventory service (Q-PU-03) would a new runtime and container be involved. That needs an SA ADR and infra research, and it is not proposed here.

Capacity (4 GB RAM / 2 vCPU): there is no new container and no new client library. The Purchase page is one more route chunk made of shared components. Server cost is bounded by the paging (≤ 50) and the 200-line limit above.

Revision 2 (2026-11-04): still **no additional packages**. The tabs, collapsible groups and pickers are built from the existing components, `lucide-react` icons (`ChevronDown`, `ChevronRight`, `MessageSquare`, `Search`, `Calendar`, `ArrowRight`, `X`) and `DateInput`. There is no new container or runtime resource.
