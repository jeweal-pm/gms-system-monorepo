# TODO: stock-adjustment

- feature-id: `stock-adjustment`
- revision: 1 (UI rev 1); SA revision 1 (**approved** 2026-11-24)
- source-ui-revision (backend items): 1 with the Q-SAJ-01…12 defaults
- status: **approved** 2026-11-24 (UI rev 1 + SA rev 1 + ADR-0059 together, all defaults). Ready to implement; no owner question remains
- request: owner 2026-11-24 (Thai text verbatim in the [ui-spec](../../apps/frontend/stock-adjustment/ui-spec.md))
- source: owner design images in [source/](../../apps/frontend/stock-adjustment/source/) (no Figma)
- ui-spec: [ui-spec.md](../../apps/frontend/stock-adjustment/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/stock-adjustment/dependencies.md): **no new package**
- backend-bundles: [inventory/stock-adjustment SA rev 1](../../apps/backend/inventory/stock-adjustment/decisions.md) (approved 2026-11-24). The bundle is: [api-contract](../../apps/backend/inventory/stock-adjustment/api-contract.md), [architecture](../../apps/backend/inventory/stock-adjustment/architecture.md), [authorization](../../apps/backend/inventory/stock-adjustment/authorization.md), [database-diagram](../../apps/backend/inventory/stock-adjustment/database-diagram.md), [sequence-diagram](../../apps/backend/inventory/stock-adjustment/sequence-diagram.md), [error-handling](../../apps/backend/inventory/stock-adjustment/error-handling.md), [dependencies](../../apps/backend/inventory/stock-adjustment/dependencies.md), [testing](../../apps/backend/inventory/stock-adjustment/testing.md). [ADR-0059](../../adr/0059-stock-adjustment-document.md) is Accepted.
- approved-revision: UI 1
- approved-by: owner
- approved-at: 2026-11-24
- approval-evidence: owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more)
- sa-approved-revision: SA 1 (ADR-0059 Accepted)
- sa-approved-by: owner
- sa-approved-at: 2026-11-24
- sa-approval-evidence: same as above
- review-bundle:
  - [ui-spec](../../apps/frontend/stock-adjustment/ui-spec.md)
  - [open-questions](../../apps/frontend/stock-adjustment/open-questions.md)
  - [conventions](../../apps/frontend/stock-adjustment/conventions.md)
  - [data-fetching](../../apps/frontend/stock-adjustment/data-fetching.md)
  - [design-system](../../apps/frontend/stock-adjustment/design-system.md)
  - [error-handling](../../apps/frontend/stock-adjustment/error-handling.md)
  - [form-guidelines](../../apps/frontend/stock-adjustment/form-guidelines.md)
  - [testing](../../apps/frontend/stock-adjustment/testing.md)
  - [flow](../../diagram/stock-adjustment-flow.md)
  - [handoff](../../coordination/handoffs/stock-adjustment-sa.md)
- related ADRs: ADR-0045, ADR-0050, ADR-0052, ADR-0053, ADR-0055, ADR-0056, ADR-0057

## Implementation items

Approved 2026-11-24: start now, no further approval or question loop. Do the backend first: FE items marked **requires-be** need the endpoint live. Files marked *shared* are serialized through the parent.

| Done | ID | Owner | Task / component | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [ ] | BE-SAJ-001 | backend | Migration: tables `stock_adjustment` and `stock_adjustment_line`; ledger kinds `ADJUST` / `ADJUST_REVERSAL`; approval type check `stock-adjustment`; Prisma models | `backend-api-inventory/prisma/schema.prisma`, `prisma/migrations/<ts>_stock_adjustment/` | approval | `migrate deploy` is clean on the dev DB; the kind list is a superset of the latest one; no change to `stock` | migration test, IT-SAJ-B01 |
| [ ] | BE-SAJ-002 | backend | Numbering key `stock-adjustment` on both sides | master `src/inventory-internal/inventory-internal.schemas.ts` *shared*, inventory `src/platform/master-api.ts` *shared* | — | resolve returns an `SA…` number; other keys unchanged | IT-SAJ-B07 + master unit test |
| [ ] | BE-SAJ-003 | backend | Approval type + Menu type: `INVENTORY_APPROVAL_TYPES`, `Menu`, `/approval/summary`, `/approval/pending` | `src/platform/approval/settings.ts` *shared*, `src/platform/auth/principal.ts` *shared*, approval read files | BE-SAJ-001 | the setting can be toggled; pending list shows adjustments | IT-SAJ-B04 |
| [ ] | BE-SAJ-004 | backend | `adjustStocks()` / `reverseAdjust()`: lock, stale check, set-based update, ADJUST ledger, price, cost, `first_used_at`, `applied_version` | `backend-api-inventory/src/modules/stock/adjust.ts` (+ test) | BE-SAJ-001 | ADR-0059 D4–D7; balance check never fails; no-change line has no movement | UT-SAJ-B02, IT-SAJ-B01/03/05/10 |
| [ ] | BE-SAJ-005 | backend | Module routes/schemas/service/repository/read: options, next-number, list, get, create, update, submit, approve, revise, reject, delete, restore | `backend-api-inventory/src/modules/stock-adjustment/**`, `src/app.ts` *shared* (mount) | BE-SAJ-002…004 | Matches [api-contract](../../apps/backend/inventory/stock-adjustment/api-contract.md) and [error-handling](../../apps/backend/inventory/stock-adjustment/error-handling.md) | IT-SAJ-B04/B05/B09 |
| [ ] | BE-SAJ-006 | backend | From Stock read `GET /stock-adjustment/stock` (own only, location, on hand > 0, exclude, keyset) | `src/modules/stock/lots.ts` (add filters), `modules/stock-adjustment/read.ts` | BE-SAJ-005 | One statement per page; never Memo Stock or 0 qty | IT-SAJ-B02/B06 |
| [ ] | BE-SAJ-007 | backend | Stock Card kinds `ADJUST` / `ADJUST_REVERSAL` (sign → IN/OUT), doc link | `src/modules/stock/card-kinds.ts` *shared* | BE-SAJ-004 | Stock Card and Stock Value show the adjustment | IT-SAJ-B08 |
| [ ] | BE-SAJ-008 | backend | Tests per [backend testing](../../apps/backend/inventory/stock-adjustment/testing.md); full inventory suite green | test files beside the sources | BE-SAJ-001…007 | all pass; commands recorded | vitest |
| [ ] | FE-SAJ-001 | frontend | Route + page shell: header (number preview, actions, status), info card (Doc Date, Main Location, Ref.), Document Note, daybook, access | `frontend/src/app/(app)/inventory/stock-adjustment/**`, `frontend/src/features/stock-adjustment/components/StockAdjustmentPage.tsx` | approval; data **requires-be** BE-SAJ-005 | Matches images 01/02; Print/Excel/Duplicate disabled | IT-SAJ-01 |
| [ ] | FE-SAJ-002 | frontend | Form model: rows, validation, decimal-safe Diff, location-change clear | `frontend/src/features/stock-adjustment/form.ts` (+ test) | — | ui-spec S-01…S-06 | UT-SAJ-01/02, IT-SAJ-03 |
| [ ] | FE-SAJ-003 | frontend | Grid with grouped headers Stock / Physical / Diff (Pcs, Cts, Price) + Remark; 5 empty rows; row states; bulk remove | `frontend/src/features/stock-adjustment/components/adjustment-table.tsx` (+ test) | FE-SAJ-002 | Matches images 02/03; Price present in all three groups | IT-SAJ-01 |
| [ ] | FE-SAJ-004 | frontend | From Stock + barcode scan: add a third prop variant to `MemoStockModal` (`source: "stock-adjustment"`, `location`) that reads `/stock-adjustment/stock` instead of `fromStock.lots`; other callers unchanged | `StockAdjustmentPage.tsx`, `features/stock-adjustment/api.ts`, `frontend/src/features/trade-document/memo-stock-modal.tsx` *shared* (+ test) | **requires-be** BE-SAJ-006 | Only own stock at the Main Location, no 0 qty, excludes picked; "Added N items from Stock" | IT-SAJ-02 |
| [ ] | FE-SAJ-005 | frontend | API adapter + wiring: create/update/submit/delete/restore, error mapping | `frontend/src/features/stock-adjustment/api.ts` (+ test) | **requires-be** BE-SAJ-005 | OFF → Approved auto; ON → Draft/Pending; STOCK_CHANGED row message; stock-card queries invalidated | UT-SAJ-03, IT-SAJ-04/05 |
| [ ] | FE-SAJ-006 | frontend (parent-serialized) | Navigation: Inventory › Stock Adjustment → `/inventory/stock-adjustment` | `frontend/src/features/home/navigation.ts` *shared* | FE-SAJ-005 | sidebar opens the real page | UT-SAJ-04 |
| [ ] | FE-SAJ-007 | frontend (parent-serialized) | Approval Setup + Approve Center panel and flow status for `stock-adjustment` | `frontend/src/features/approval-setup/model.ts`, `features/approve-center/**`, `features/trade-document/flow-status.ts` *shared* | BE-SAJ-003 | panel with count; Approve / Revise / Reject work | IT-SAJ-06 |
| [ ] | FE-SAJ-008 | frontend | Tests per [frontend testing](../../apps/frontend/stock-adjustment/testing.md); full frontend suite green | test files beside the sources | FE-SAJ-001…007 | all pass; commands recorded | vitest |
| [ ] | FE-SAJ-009 | parent | Both security reviews on one source revision + manual-tester report + done record | `document/task/investigation/`, `document/testing/user-check/`, `document/task/done/` | BE-SAJ-008, FE-SAJ-008 | recorded once; findings go to investigation | review records |
