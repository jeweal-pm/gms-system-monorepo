# 2026-10-29 Memo Outstanding From Vendor frontend (FE-MOV-001…003)

- Feature `memo-outstanding-vendor` UI rev 1 / SA rev 1 / ADR-0035, approved by the owner 2026-10-29 ("อนุมัติ memo-outstanding-vendor revision 1").
- New page `/memo/memo-outstanding/vendor` ("From Vendor"): sidebar Memo › Memo Outstanding › Vendor now opens it (`REAL_PAGE_HREFS["memo-outstanding-from-vendor"]`); needs `memo-outstanding-vendor:VIEW`.
- KPI cards (Documents, Overdue, Due in 7 days, Grand total in the company currency); search, Vendor multi-select and Doc Date range kept in the URL; table with Memo · Return · Sold · Reserve · Outstanding (Pcs / Weight) and open value; due labels; sort; pager 10 / 25 / 50.
- Expand rows (items loaded once, kept 30 s), Show subtasks Collapsed / Expanded (one batched call per page of up to 25 documents), Customize view panel kept per browser (`gms.memo-outstanding-vendor.view.v1`), item selection with "Show selected rows only", Print (PRINT only) of the selection or the current page; Excel shows "Excel export isn't available yet".
- Evidence: [testing.md](../apps/backend/master/memo-outstanding-vendor/testing.md#frontend-verification-2026-10-29-fe-mov-001004); TODO [memo-outstanding-vendor.md](../task/todo/memo-outstanding-vendor.md). Security review pending.
