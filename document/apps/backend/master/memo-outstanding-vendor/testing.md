# Testing: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

| ID | Level | Check |
|---|---|---|
| IT-MOV-01 | integration (DB) | Migration: backfill to 0. The balance CHECK refuses a row where pending ≠ received − buckets. Rollback works. |
| IT-MOV-02 | integration | `vendorList` lists only approved documents with open items. Pending-approval and fully settled documents are hidden. The bucket sums per document are correct, including Outstanding = Memo − Return − Sold − Reserve with buckets set directly in the test. |
| IT-MOV-03 | integration | Filters (q escaping `%`/`_`, vendorIds, doc date range), every sort key both ways with stable tie-break, paging totals |
| IT-MOV-04 | integration | `vendorSummary`: overdue and dueIn7Days at the Bangkok date boundary (fake clock). Grand total conversion with an exchange rate and with company currency. |
| IT-MOV-05 | integration | `vendorItems`: ≤ 25 ids, unknown or unapproved ids skipped, order, photoCount, open value for PER_CT and PER_PCS |
| UT-MOV-R1 | unit (router) | every procedure needs `memo-outstanding-vendor:VIEW`. Bounds are refused (pageSize 100, 26 ids, 51 vendors, 400-day range). |
| UT-MOV-F1 | unit (frontend) | due label (overdue, due in, in), KPI rendering, URL filter state, expand loads once, Expanded mode makes one batched call |
| UT-MOV-F2 | unit (frontend) | Customize view: locked columns, column-header order, hide all and show all, persistence with blocked storage. Selection bar with "Show selected rows only" and Print visibility without PRINT. Excel unavailable. Empty and error states. |

## Backend verification 2026-10-29 (BE-MOV-001…003)

| Target | Test | Result |
|---|---|---|
| Migration `20261030090000_memo_stock_buckets`, Prisma `MemoStock` buckets, approve inserts 0 | IT-MOV-01 (`backend-api-master/test/trade-document/memo-outstanding.db.integration.test.ts`) | pass: column types/defaults, approve → buckets 0, `memo_stock_balance` refuses pcs and weight mismatch, `memo_stock_buckets_nonneg` refuses a balanced negative bucket, over-move refused by `memo_stock_quantity_check`, partial index predicate, rollback statements in a rolled-back transaction |
| `MemoOutstandingService.vendorList` | IT-MOV-02, IT-MOV-03 | pass: approved + open only (pending-approval, fully settled hidden; reserve-only shown), per-document sums, Outstanding = Memo − Return − Sold − Reserve, q escaping `%` `_` `\`, vendorIds (dedup), doc date range, all 9 sort keys asc/desc against the documented tie-break, default dueDate asc → docNo → id, pages 10/2/0 with total 12 |
| `vendorSummary` | IT-MOV-04 | pass: Bangkok boundary (UTC 16:59:59 vs 17:30 → Oct 29 vs Oct 30; due today counts in dueIn7Days, today + 8 does not), grand total 1000.00 + 123.40 × 35 + 600.00 + 100.00 = 6019.00, rate change → 4604.10 for one vendor, empty → zeros, companyCurrency = company profile |
| `vendorItems`, `vendorOptions` | IT-MOV-05, IT-MOV-05b | pass: unknown / pending-approval / settled ids skipped, duplicates collapsed, doc number then line order, photoCount 2/0, PER_CT 500.00 and PER_PCS 500.00 open value, partial PER_CT 61.70, items sum to the doc row; options = vendors with approved documents, by name |
| Router `memoOutstanding.*`, `MasterMenu` | UT-MOV-R1 (`test/master/router.test.ts`) | pass: `memo-outstanding-vendor:VIEW` on all four (memo-receive/vendor/PRINT grants refused, no CSRF needed for reads, grant checked before validation), bounds pageSize 100, 26 ids, 0 ids, 51 vendors, 400-day range, from > to, sort, page 0, q 101 → `VALIDATION_ERROR` with `fieldErrors` (`pageSize`, `memoReceiveIds`, `vendorIds`, `to: range_too_long / before_from`, `sort`, `page`, `q`); service failure → `SERVICE_UNAVAILABLE` |
| Regression | IT-MR-06 | updated: a returned quantity now moves into `returned_*` (the balance CHECK refuses changing pending alone); IT-MR fixtures tolerate a concurrent DB integration file |

- DB integration: disposable `postgres:18.6-alpine` at `127.0.0.1:55441`, tmpfs data, 256 MB limit, no project volume, all migrations by `prisma migrate deploy`; `test/trade-document/` 5 files / 39 tests passed (run 3 times); container removed after the run.
- Default suite (no DB URL, `NODE_OPTIONS=--max-old-space-size=1024`): 37 files passed, 3 skipped; 412 tests passed, 34 skipped. `npm run typecheck` and `npm run lint` clean.
- Local dev DB: `prisma migrate deploy` applied `20261030090000_memo_stock_buckets`; existing rows 260002 (10 / 10.000) and 260003 (20 / 20.000) have buckets 0 and both CHECKs are validated; `docker restart f1-system-api-master-1` → healthy. Live as `superadmin@demo.com` through `localhost:8080`: `vendorOptions` 1 vendor, `vendorSummary` {documents 1, overdue 0, dueIn7Days 1, grandTotal 12000.00, AED}, `vendorList` MR-1 (dueInDays 2, Memo 30 / 30.000, open 12000.00), `vendorItems` 2 items (photoCount 3 and 1, an unknown id skipped); HTTP 400 envelopes carry `data.domainCode = VALIDATION_ERROR` and `data.fieldErrors` (`pageSize: invalid_union`, `to: before_from`, `to: range_too_long`, `memoReceiveIds: too_small`, `sort: invalid_value`); no session → 401.

## Frontend verification 2026-10-29 (FE-MOV-001…004)

Working tree on `feat/29-10-26-integrate-memo-receive` (uncommitted), frontend role. No new package.

| Target | Unit | Integration | Result |
|---|---|---|---|
| Route `/memo/memo-outstanding/vendor`, `REAL_PAGE_HREFS["memo-outstanding-from-vendor"]`, sidebar link, `memo-outstanding-vendor` gate | UT-MOV-NAV (`frontend/test/memo-outstanding-vendor/navigation.test.ts`, 2); UT-MENU-05b updated (Vendor is no longer a `/modules` placeholder) | live: page 200 through `localhost:8080` | pass |
| `model.ts`: URL filter state, sort, paging, due label, number formats, date-range check, Customize view model + per-browser store, selection / print rows, item cache `loadDocItems` | UT-MOV-F1 (13), UT-MOV-F2 (12) in `frontend/test/memo-outstanding-vendor/memo-outstanding-vendor.test.ts` | IT-MOV-F1 | pass |
| `api.ts`: access (VIEW/PRINT/EXCEL), error mapping, `memoOutstanding.*` reads | UT-MOV-F2 (errors, access) | IT-MOV-F1 (`api.integration.test.ts`, 2): controlled tRPC server through `httpBatchLink` + `createDomainTrpcFetch`: list input `{page 1, pageSize 25}`, one batched `vendorItems` GET for the open page, no refetch within 30 s, `x-gms-csrf` + credentials, rendered rows; `PERMISSION_DENIED` envelope | pass |
| Components: KPI cards, filter bar / vendor popover, toolbar (Print hidden without PRINT, Excel unavailable), selection bar, table (grouped columns, due labels, item rows, links), pager, Customize view panel, print view, empty state | UT-MOV-F1/F2 (static render) | IT-MOV-F1 (table from server data) | pass |

- Commands (in `frontend/`): `npx vitest run` → 48 files / 494 tests passed; `npx tsc --noEmit` clean; `npx eslint .` 0 errors (2 existing warnings in `src/features/auth/login-form.tsx`).
- Live (dev stack, `docker restart f1-system-frontend-1`, no volume change): `/memo/memo-outstanding/vendor` → 200; as `superadmin@demo.com`: `vendorSummary` {documents 1, overdue 0, dueIn7Days 1, grandTotal 12000.00, AED}, `vendorList` (pageSize 25) MR-1 (dueInDays 2, Memo 30 / 30.000, open 12000.00 AED), `vendorOptions` 1 vendor, `vendorItems` 2 items (260002, 260003). The page was not driven in a browser in this pass (no browser runner); interactive behavior is covered by the unit/integration cases above.
- Not covered by an automated DOM test (no DOM runner installed): popover/panel focus trap and Esc, `beforeprint` timestamp, debounce timing. Dual security review (FE-MOV-004) is pending with the parent.
