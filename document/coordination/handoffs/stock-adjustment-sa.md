# Handoff: stock-adjustment (UI rev 1 + SA rev 1, approved 2026-11-24)

- Feature ID: `stock-adjustment` · branch at creation: `feat/24-11-26-stock-adjustment` (from dev 61944bf)
- Status: **approved** 2026-11-24. Approval evidence: owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more).
- Prepared 2026-11-24 for the owner's request "สร้างโฟลเดอร์ และ วาง plan ออก adr ให้เมื่อมีคน pull ลงมาเเล้วให้claude อ่านเเล้วทำได้เลย".

## For the next Claude session: read in this order
1. [ui-spec](../../apps/frontend/stock-adjustment/ui-spec.md) and the [source images](../../apps/frontend/stock-adjustment/source/)
2. [open-questions](../../apps/frontend/stock-adjustment/open-questions.md): every default is **approved**; read them as decisions
3. [ADR-0059](../../adr/0059-stock-adjustment-document.md)
4. [SA decisions](../../apps/backend/inventory/stock-adjustment/decisions.md), [api-contract](../../apps/backend/inventory/stock-adjustment/api-contract.md), [database-diagram](../../apps/backend/inventory/stock-adjustment/database-diagram.md), [sequence-diagram](../../apps/backend/inventory/stock-adjustment/sequence-diagram.md)
5. The [TODO](../../task/todo/stock-adjustment.md). Do the BE items first, then the FE items.

## Before coding: nothing to ask
- The bundle is **approved** (UI rev 1 + SA rev 1 + ADR-0059, all Q-SAJ / SQ-SAJ defaults). The owner asked that the implementer **not ask any questions**. Start at BE-SAJ-001 right away; this approval authorizes the code work (AGENTS.md).
- If the code differs slightly from these documents (a function name, a file split, the exact latest kind list, a column type), follow the intent of ADR-0059, decide yourself, and note the deviation in [decisions](../../apps/backend/inventory/stock-adjustment/decisions.md) under "Implementation notes". Do not stop to ask.
- Ask the owner only if the change would go outside ADR-0059 itself: a new service, a new package, or touching master stock data.
- Rough order: BE-SAJ-001 → 002/003 → 004 → 005 → 006/007 → 008, then FE-SAJ-002 → 003 → 001 → 004 → 005 → 006/007 → 008, then FE-SAJ-009 (reviews + manual test).
- Before running, restart the stack so the Windows watchers pick up the branch: `docker restart f1-system-backend-api-inventory-1 f1-system-api-master-1`. The master cold start takes about 2–3 minutes. The new migration runs through the inventory migrate job in `pnpm docker:gms:preview`.

## Reference code to copy
| Need | Copy from |
|---|---|
| inventory document module | `backend-api-inventory/src/modules/sale/{routes,schemas,service,repository,read}.ts` |
| lock + set-based stock update + ledger | `backend-api-inventory/src/modules/sale/own-stock.ts` (`consumeOwn`/`releaseOwn`) |
| lot picker query | `backend-api-inventory/src/modules/stock/lots.ts` (`lotsAvailablePage`) |
| ledger kind migration | `backend-api-inventory/prisma/migrations/20261123120000_sale_own_stock/migration.sql` |
| Stock Card kinds | `backend-api-inventory/src/modules/stock/card-kinds.ts` |
| approval types | `backend-api-inventory/src/platform/approval/settings.ts` |
| numbering | `backend-api-inventory/src/platform/master-api.ts`, `backend-api-master/src/inventory-internal/inventory-internal.schemas.ts` |
| page | `frontend/src/features/load-to-stock/components/LoadToStockPage.tsx`, `frontend/src/features/sale/components/SalePage.tsx` |
| From Stock dialog | `frontend/src/features/trade-document/memo-stock-modal.tsx` |

## Allowed paths
- `backend-api-inventory/src/modules/stock-adjustment/**` and `src/modules/stock/adjust.ts` (+ tests)
- A new migration folder and the `prisma/schema.prisma` models
- `frontend/src/features/stock-adjustment/**` and `frontend/src/app/(app)/inventory/stock-adjustment/**`
- **Shared files (the parent serializes these):**
  - `backend-api-inventory/src/app.ts`
  - `src/platform/approval/settings.ts`
  - `src/platform/master-api.ts`
  - `src/platform/auth/principal.ts`
  - `src/modules/stock/card-kinds.ts`
  - `backend-api-master/src/inventory-internal/inventory-internal.schemas.ts`
  - `frontend/src/features/home/navigation.ts`
  - `frontend/src/features/approve-center/**`
  - `frontend/src/features/approval-setup/model.ts`
  - `frontend/src/features/trade-document/flow-status.ts`
  - task pointers

## Done means
- Both testing tables pass.
- Both security reviews (`sec-auditor` + `security-auditor`) have run once on one source revision.
- The manual-tester report is under `document/testing/user-check/`.
- `task/done/YYYY-MM-DD-stock-adjustment.md` exists.
