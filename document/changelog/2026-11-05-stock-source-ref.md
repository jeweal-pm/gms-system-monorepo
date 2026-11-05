# 2026-11-05 Stock source Ref. on memo stock items (backend)

- Owner instruction 2026-11-04 (direct; authorizes the scope): the From Stock picker shows **Ref.** = the source transaction no. — the Memo Receive no. today, a Load document no. in the future (no Load page/table exists yet). Frontend side: [2026-11-05-picker-ref-columns](2026-11-05-picker-ref-columns.md).
- Contract (additive): every item of `memoStock.list` and `purchase.memoStock` gains `ref: { type: "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string; docDate: string }`. Today always `{ type: "MEMO_RECEIVE", id: memo_receive_id, docNo: received_doc_no, docDate }` (YYYY-MM-DD, same as `memoReceive.docDate`). `memoReceive` unchanged. No migration, permission, search, ordering or other behaviour change.
- Code (`backend-api-master`):
  - `src/trade-document/memo-stock.service.ts`: `STOCK_SOURCE_TYPES`, `StockSourceType`, `StockSourceRef`, `memoReceiveSourceRef()` (single export point; `LOAD` reserved for the Load document); `toStockRow` adds `ref`.
  - `src/purchase/purchase-pickers.ts`: `toMemoStockRow` adds `ref` via `memoReceiveSourceRef`.
- Tests: `test/purchase/purchase-pickers.test.ts` (UT-PU-B04: `ref` in the row shape; new case for `STOCK_SOURCE_TYPES` / `memoReceiveSourceRef`), `test/purchase/purchase.db.integration.test.ts` (IT-PU-B05: every row's `ref` = its Memo Receive), `test/trade-document/memo-receive.db.integration.test.ts` (IT-MR-06: `ref` on `memoStock.list` items).
- Contract docs: [memo-receive api-contract](../apps/backend/master/memo-receive/api-contract.md) (`MemoStockRow.ref` + note), [purchase api-contract](../apps/backend/master/purchase/api-contract.md) (Memo Stock picker row + note).
- Verification (HEAD `c401880` + working tree; `backend-api-auth/**` untouched):
  - `npx tsc --noEmit` exit 0; `npx eslint src "test/**/*.ts"` exit 0.
  - `npx vitest run` (default): 44 files passed / 12 skipped; 476 tests passed / 73 skipped (DB-gated).
  - Disposable `postgres:18.6-alpine` at `127.0.0.1:55440` (tmpfs, 256 MB, no project volume, all master migrations by `prisma migrate deploy`, removed afterwards): affected `test/purchase` + memo-receive suites 8 files / 62 tests passed; full `PARTNER_TEST_DATABASE_URL=… npx vitest run` 55 files passed / 1 skipped, 531 tests passed / 18 skipped (auth live opt-ins).
  - Dev: `docker restart gms-system-monorepo-api-master-1` → healthy, "Nest application successfully started"; `node docker/repair-dev-networks.cjs` OK.
- Security reviews (`sec-auditor`, `security-auditor`): routed by the parent on the final revision.
