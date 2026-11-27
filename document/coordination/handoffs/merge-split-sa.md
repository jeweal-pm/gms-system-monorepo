# Handoff: merge-split SA rev 1 (pending-review)

- Feature ID: `merge-split` · UI rev 1 (pending-review, Q-MS-01…16 defaults) · SA rev 1 (pending-review) · [ADR-0060](../../adr/0060-merge-split-own-stock.md) **Proposed**
- Prepared 2026-11-27 for the owner request "sa เขียน adr ... หน้าตา UI จะเหมือนหน้า Load ... ปุ่ม from stock ... ของของคลังเราเอง" (design only; no implementation authorized).
- Approval evidence: none. One owner approval of UI rev 1 + SA rev 1 + ADR-0060 (with Q-MS and SQ-MS-01…06 defaults) starts BE-MS-001.

## Read in this order
1. [ui-spec](../../apps/frontend/merge-split/ui-spec.md) and [open-questions](../../apps/frontend/merge-split/open-questions.md)
2. [ADR-0060](../../adr/0060-merge-split-own-stock.md)
3. [SA decisions](../../apps/backend/inventory/merge-split/decisions.md) → [api-contract](../../apps/backend/inventory/merge-split/api-contract.md) → [database-diagram](../../apps/backend/inventory/merge-split/database-diagram.md) → [sequence-diagram](../../apps/backend/inventory/merge-split/sequence-diagram.md)
4. [TODO](../../task/todo/merge-split.md): BE-MS-001 → 002 → 003 → 004 → 005/006 → 007, then FE items.

## Notes for the implementer
- The only cross-service change is master: numbering key `merge-split` and the new idempotent `stock-ids/issue` endpoint + `partner.inventory_stock_id_issue` table (BE-MS-002). Serialize the master/inventory internal files and `src/app.ts` through the parent.
- No auth change (leaf exists), no new package, no infra/devops impact.
- Reference code: `modules/stock-adjustment/**` (module), `modules/sale/own-stock.ts` (lock + set update + ledger), `modules/stock/stock.ts` (`createStocks`, `reverseStocks`), `modules/load-to-stock/{cost,photos}.ts`, master `issueStockIds`.
- The UI data-fetching names are assumptions; the SA api-contract wins (e.g. `exclude`, `/merge-split/stock/{uuid}/photos`).
