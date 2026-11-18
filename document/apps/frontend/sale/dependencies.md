# Frontend dependency decisions: sale

- UI revision: 1 (pending-review)
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md) — **no entry added**
- Status: **no additional packages**

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | — | — | — | — | — | — | — | — |

Reused instead (all installed and in use, C):

- `DocumentForm` with `picker` + `secondaryPicker` (`trade-document/document-form.tsx`), `ItemTable`, `ItemEditorPanel`, `ItemPhotoBox`, `SummaryValue`, `DocumentNote`, `DocumentDaybook`, `useDocumentFlow` (ADR-0050), soft delete (ADR-0045), `DOCUMENT_PHOTOS` (ADR-0048).
- `QuotationInfoForm` / `customerStockConfig` customer header (Reserve, Memo Out).
- `MemoStockModal` (From Stock phase 1) and the Purchase picker shell (`purchase-picker.tsx`, moved to `trade-document/` in FE-SL-001) for From Reserve.
- react-hook-form, zod, TanStack Query, tRPC client, lucide icons — unchanged versions.

Backend/runtime: no new container in phase 1 if SA keeps Sale in `backend-api-master` (Q-SL-02). Line photos (Q-SL-12) need one nginx location (infra, as ADR-0048 did). Placing Sale in `backend-api-inventory` adds no container either (the service exists) but adds a master ↔ inventory saga; SA records the capacity effect against the 4 GB RAM / 2 vCPU budget.
