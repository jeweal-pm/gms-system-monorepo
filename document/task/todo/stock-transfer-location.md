# TODO: stock-transfer-location

- feature-id: `stock-transfer-location`
- revision: 1 (owner design images, no separate ui-spec; UI rules are ADR-0060 D12); SA revision 1
- status: **approved** 2026-11-24, in progress
- request: owner 2026-11-24 (verbatim in [ADR-0060](../../adr/0060-stock-transfer-location-document.md))
- source: [apps/frontend/stock-transfer-location/source/](../../apps/frontend/stock-transfer-location/source/) images 01–03
- backend-bundles: [ADR-0060](../../adr/0060-stock-transfer-location-document.md) (Accepted) + [api-contract](../../apps/backend/inventory/stock-transfer-location/api-contract.md)
- approved-revision: UI 1 + SA 1
- approved-by: owner
- approved-at: 2026-11-24
- approval-evidence: owner "อนุมัติ" in chat, 2026-11-24 (ADR-0060), then "frontend backend เริ่มทำ stock transfer location ได้เลย" (starts implementation)
- dependencies: no new package

## Implementation items

Shared files (*) are owned by one role in this run. Backend owns the inventory/master shared files, and frontend owns the frontend shared files. No file is edited by both roles.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-STL-001 | backend | Migration: `stock_transfer`, `stock_transfer_line`, `stock.transferred_from_uuid`, +4 ledger kinds, approval-type check, indexes | `backend-api-inventory/prisma/schema.prisma`, `prisma/migrations/<ts>_stock_transfer_location/` | — | ADR-0060 D2/D4; migrate deploy clean | migration + IT Done 2026-11-27: migration `20261124120000_stock_transfer_location` (+ rollback); also widens `stock_movement.kind` to VARCHAR(32) (`TRANSFER_OUT_REVERSAL` is 21 chars); approval type/row already present. |
| [x] | BE-STL-002 | backend | Master: numbering key + `PUT /stock-id-issues/{type}/{id}` + `stock_id_issue` table | `backend-api-master/src/inventory-internal/**`*, `backend-api-master/prisma/**` | — | D6/D10; replay returns the same ids | master unit + IT Done 2026-11-27: master key + `PUT /stock-id-issues/{type}/{id}`, table `partner.stock_id_issue` (migration `20261124120000_stock_id_issue` + rollback); replay / append / stale covered (IT-STL-10, UT-STL-M01/M02). |
| [x] | BE-STL-003 | backend | `modules/stock/transfer.ts` apply / reverse | `backend-api-inventory/src/modules/stock/transfer.ts` (+ test) | 001, 002 | D3/D7/D9; balance check holds; cost split exact | IT Done 2026-11-27: `modules/stock/transfer.ts` apply (6 stmts) / reverse (6 stmts); Load in-use now counts transferred stock. |
| [x] | BE-STL-004 | backend | Module routes/schemas/service/repository/read + mount + numbering/issue client + Menu type + approval summary/pending | `backend-api-inventory/src/modules/stock-transfer-location/**`, `src/app.ts`*, `src/platform/**`* | 003 | matches api-contract | IT per route Done 2026-11-27: module + mount + issue client + approval summary/pending/waiting counts + notifications; contract "As built" section records deviations. |
| [x] | BE-STL-005 | backend | Stock Card kinds + `TRANSFER` source | `src/modules/stock/card-kinds.ts`*, `card.ts`* | 003 | D5: OUT old card, IN new card, ST doc no | IT Done 2026-11-27: 4 kinds + `TRANSFER` source (doc no/date from stock_transfer, `→ to` / `← from`). |
| [x] | BE-STL-006 | backend | Tests + full inventory/master suites green | test files | 001–005 | all pass | vitest/jest Done 2026-11-27: see testing.md (results). |
| [x] | FE-STL-001 | frontend | Route + page shell, header, info card, daybook, access | `frontend/src/app/(app)/inventory/stock-transfer-location/**`, `frontend/src/features/stock-transfer-location/**` | contract | images 01/02 | IT Done 2026-11-27: routes + `StockTransferLocationPage` (header, Doc Date/Ref., Item card, Daybook/Summary rail, access, deleted banner + Restore); IT-STL-01. |
| [x] | FE-STL-002 | frontend | Grid (left read-only, teal NEW LOCATION / PCS / WEIGHT), row states, validation | `features/stock-transfer-location/**` | 001 | D12 | UT/IT Done 2026-11-27: `transfer-table.tsx` + `form.ts` (5 empty rows, sortable left part, teal NEW LOCATION/PCS/WEIGHT, row states, PCS→WEIGHT fill, Save rules); UT-STL-01, IT-STL-02. |
| [x] | FE-STL-003 | frontend | From Stock + barcode via `MemoStockModal` data-source variant | `frontend/src/features/trade-document/memo-stock-modal.tsx`* (+ test) | 002 | other callers unchanged; excludes picked lots | IT Done 2026-11-27: `MemoStockModal` `source: "stock-transfer-location"` (q/exclude on `/stock`, Ref. date filter client-side); barcode `lookupScan` (exactly one match); IT-STL-03, UT-STL-02d; other callers' tests unchanged and green. |
| [x] | FE-STL-004 | frontend | API adapter + wiring + error mapping | `features/stock-transfer-location/api.ts` | contract | ON/OFF flow; row errors | UT/IT Done 2026-11-27: `api.ts`/`types.ts`: all contract routes, hooks, invalidation incl. stock-card/stock-value, row-level mapping by `lineId` (EXCEEDS_ON_HAND, LINE_UNAVAILABLE, LOCATION_INVALID), IN_USE, VERSION_CONFLICT; UT-STL-02. |
| [x] | FE-STL-005 | frontend | Navigation, Approval Setup enable, Approve Center panel, flow status, Stock Card doc link | `features/home/navigation.ts`*, `features/approval-setup/**`*, `features/approve-center/**`*, `features/trade-document/flow-status.ts`*, `features/stock-card/**`* (doc link only) | 004 | panel + link work | UT/IT Done 2026-11-27: navigation link, Approval Setup available, Approve Center menu/client/preview (`stockTransferLocation`), flow-status `STOCK_TRANSFER`, Stock Card DOC NO route; IT-STL-04/05; 4 outdated not-available assertions updated. |
| [x] | FE-STL-006 | frontend | Tests + full frontend suite green | test files | 001–005 | all pass | vitest Done 2026-11-27: `vitest run` 148 files / 1400 tests pass; `tsc --noEmit` clean (only stale `.next/types`); eslint 0 errors. Browser smoke pending (stack at :8080 down at handoff). |
| [ ] | STL-007 | parent | Both security reviews on one revision + manual test + done record | `document/task/investigation/`, `document/testing/user-check/`, `document/task/done/` | 006s | recorded once | — |
