# 2026-10-29 Memo Outstanding From Vendor backend (BE-MOV-001…003)

- Feature `memo-outstanding-vendor` UI rev 1 / SA rev 1 / ADR-0035, approved by the owner 2026-10-29 ("อนุมัติ memo-outstanding-vendor revision 1").
- `backend-api-master`: migration `20261030090000_memo_stock_buckets` (additive: `returned_*`, `sold_*`, `reserved_*` on `memo_stock`, default 0; CHECKs `memo_stock_buckets_nonneg`, `memo_stock_balance`; partial index `memo_stock_open_idx`). No writer of the buckets in this revision.
- `MemoOutstandingService` + schemas: read-only `memoOutstanding.vendorSummary`, `vendorList` (offset paging 10/25/50, sort whitelist), `vendorItems` (≤ 25 docs), `vendorOptions` (≤ 1,000); `memo-outstanding-vendor:VIEW` on each; `MasterMenu` + `memo-outstanding-vendor`. Validation refusals of these procedures carry `fieldErrors`.
- Evidence: [testing.md](../apps/backend/master/memo-outstanding-vendor/testing.md#backend-verification-2026-10-29-be-mov-001003); TODO [memo-outstanding-vendor.md](../task/todo/memo-outstanding-vendor.md).
