# 2026-11-05 Stock pickers: Ref. column, Memo ID first, Add Purchase Order as From Stock

- Owner instructions 2026-11-04 (direct; authorize the scope; recorded in [purchase ui-spec Revision 3](../apps/frontend/purchase/ui-spec.md#revision-3-picker-ref--memo-id--po-no-columns-owner-2026-11-04)):
  1. From Stock picker: add **Ref.** (transaction no.: the memo no., or the Load no. later; no Load page yet).
  2. Purchase Memo Stock picker: header **Memo ID** instead of Stock ID, Memo ID on top and Stock ID under it.
  3. Add Purchase Order: **PO No.** instead of PO Line, and the same UI as the normal From Stock picker.
- Code (frontend only):
  - `frontend/src/features/trade-document/stock-ref.ts` (new): `stockRef` / `stockRefLabel` use the API's additive `ref { type: MEMO_RECEIVE | LOAD; id; docNo; docDate }` and fall back to `memoReceive`.
  - `frontend/src/features/trade-document/memo-stock-modal.tsx`: Ref. / Doc Date column (`RefCell`, "Load" hint for LOAD); "from MR-xxxx" sub-line removed (vendor code kept when every vendor is listed). Affects Quotation From Stock, Reserve, Memo Out, Memo Out Return and Memo Return the same way.
  - `frontend/src/features/purchase/components/purchase-pickers.tsx`: Memo ID column; Add Purchase Order flat, no tabs/groups/Status, PO No. (Doc Date) + Stone Code (Auto · lot) columns.
  - `frontend/src/features/purchase/components/purchase-picker.tsx`: the shell hides the tab bar when a picker has no tabs and the group header rows when `flat`.
- Backend: the `ref` field is added in parallel by the backend agent (not part of this change).
- Tests: `test/trade-document/stock-ref.test.ts` (new), `test/purchase/{purchase-picker.test.ts,purchase-page.integration.test.ts,fixtures.ts}`, `ref` added to the memo stock fixtures in `test/{memo-out,memo-return,reserve}/*.test.ts` and `test/quotation/from-stock.test.ts`.
- Verification: frontend `vitest run` 74 files / 705 tests passed, `tsc --noEmit` 0 errors, `eslint .` 0 errors (2 old warnings). Security reviews: routed by the parent.
- Security review 2026-11-05 (HEAD `c401880` + working tree, with the backend `ref` change): sec-auditor clear, security-auditor clear; no ticket. Advisory: a future LOAD source needs its own authorization/vendor-scoping review.
- Owner 2026-11-05: From Stock first column is "Stone Code / Stock ID · Lot" (stone code bold, Stock ID + lot badge); Ref. column placed after Location. Backend `memoStock.list` adds `stoneCode` from the source Memo Receive line (`stone_code_snapshot`, PK lookup, no migration). Frontend vitest 707, tsc 0, eslint 0 errors; backend tsc 0, vitest 476; live memoStock.list returns real stone codes. Security review (HEAD `d9b6432` + tree): sec-auditor clear, security-auditor clear; no ticket.
