# Testing: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

These tests follow [automated-testing](../../../../workflow/automated-testing.md). Unit tests use Vitest. Integration tests run against the real Postgres used by the existing inventory integration suites (copy the sale suite setup).

| ID | Level | Target | Checks |
|---|---|---|---|
| UT-SAJ-B01 | unit | `schemas.ts` | ranges, ≤ 200 lines, distinct stockUuid, decimals as strings |
| UT-SAJ-B02 | unit | delta / cost math | Δpcs, Δweight, Δcost by price unit; no-change line produces no movement |
| UT-SAJ-B03 | unit | `read.ts` | list, picker, summary and pending use one query each; page-sized inputs do not add statements |
| UT-SAJ-B04 | unit | `getDetail` | a 200-line detail still uses one header + one joined line query |
| IT-SAJ-B01 | integration | create OFF | on hand = physical, `pcs` moved by Δ, balance check holds, one ADJUST row per changed line, `first_used_at` set, price replaced |
| IT-SAJ-B02 | integration | count to 0 | lot disappears from `GET /stock-adjustment/stock` and from master From Stock |
| IT-SAJ-B03 | integration | stale | another doc moves on hand after pick → 409 STOCK_CHANGED, nothing written |
| IT-SAJ-B04 | integration | approval ON | DRAFT has no stock effect; submit → PENDING; approve applies; revise once; reject final |
| IT-SAJ-B05 | integration | edit / delete effective | reverse restores on hand + price, ADJUST_REVERSAL written; IN_USE when the stock moved later |
| IT-SAJ-B06 | integration | picker | location filter, own only, on hand > 0, exclude, keyset paging |
| IT-SAJ-B07 | integration | numbering | `SA` prefix via master resolve; preview does not reserve |
| IT-SAJ-B08 | integration | Stock Card | ADJUST shows as IN (positive) / OUT (negative) with the doc link |
| IT-SAJ-B09 | integration | authorization | each route refuses without its grant; CSRF required |
| IT-SAJ-B10 | integration | concurrency | two approvals on the same stock in parallel → one wins, the other gets STOCK_CHANGED (row lock order by id) |

## N+1 review and query budgets

Reviewed every endpoint that reads inventory rows against one row and many rows. App-side SQL statement counts stay fixed as line or page size grows; list/pending line totals are joined from grouped CTEs, not loaded per document.

| Endpoint / operation | One row / one parent | Many rows / many parents | Budget and evidence |
|---|---:|---:|---|
| `GET /stock-adjustment/options` | no inventory SQL; 2 cached master reads (reference + numbering) | same | Fixed master calls. Implementation note records the bounded deviation from the approved one-call target. |
| `GET /stock-adjustment/next-number` | 1 inventory aggregate + 1 master resolve | same | Fixed. The aggregate is scoped to the configured `numbering_id`; preview does not reserve. |
| `GET /stock-adjustment` | 1 SQL statement | 1 SQL statement for ≤ 50 rows | Keyset page + one grouped line-count CTE. |
| `GET /stock-adjustment/{id}` | 2 SQL statements | 2 SQL statements for ≤ 200 lines | Header/settings, then one joined line read; no query per line. |
| `GET /stock-adjustment/stock` | 1 SQL statement | 1 SQL statement for ≤ 50 stocks | Keyset range over active own-stock rows; excluded UUIDs and location are bound parameters. |
| `/approval/summary` | 1 SQL statement | 1 SQL statement | Capped count (100); only for approvers with VIEW + APPROVE. |
| `/approval/pending` | 1 SQL statement | 1 SQL statement for ≤ 50 documents | One grouped totals CTE; no per-document line-count or delta queries; includes `revisionCount` for the one-revise UI limit. |
| Create / apply | bounded lock/read + set UPDATE + bulk ledger insert + snapshot UPDATE | same for ≤ 200 lines | No per-line query; locks stock UUIDs in sorted order. No-op lines are validated but do not mutate stock/version or get a ledger row. |
| Reverse / edit / delete | line read + ordered stock lock + set UPDATE + bulk ledger insert + snapshot clear | same for ≤ 200 lines | No per-line query; version guard uses the locked rows. |

## Implementation verification (2026-11-24)

- `docker exec -w /app/backend-api-inventory gms-system-monorepo-backend-api-inventory-1 pnpm exec prisma validate` — passed.
- `docker exec -w /app/backend-api-inventory gms-system-monorepo-backend-api-inventory-1 pnpm exec prisma migrate deploy` on the local dev database — applied the 8 pending migrations (20261119090000 through 20261124120000); follow-up `prisma migrate status` reports schema up to date. Inventory and master API containers were restarted afterward.
- `docker exec -w /app/backend-api-inventory gms-system-monorepo-backend-api-inventory-1 pnpm exec tsc --noEmit --pretty false` — passed.
- Focused Vitest suites in the inventory container — Stock Adjustment domain/read tests 5/5 passed initially; after adding the pending-row revision count, domain/read/integration suites passed 9/9 against the disposable database.
- `pnpm exec eslint src/modules/stock-adjustment src/modules/stock/adjust.ts test/stock-adjustment` and `pnpm exec tsc --noEmit --pretty false` in the API-master container — passed.
- Full inventory suite: `docker exec -w /app/backend-api-inventory -e INVENTORY_TEST_DATABASE_URL=<disposable-db> -e INVENTORY_APP_TEST_DATABASE_URL=<disposable-app-role> -e PERF_OUT=/tmp/gms-saj-perf.out gms-system-monorepo-backend-api-inventory-1 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism` — **not green** (21 files: 14 passed, 5 failed, 2 skipped; 197 tests passed, 26 failed, 6 skipped). All Stock Adjustment unit/read/PostgreSQL integration tests passed in this run. Remaining failures were in existing own-stock/Sale/Stock Value suites: FK cleanup errors in the Sale reserve fixtures, cascading 500 responses after those fixtures failed, Stock Value timeout/busy/query-count assertions, and one own-stock query-budget assertion. The 4 GB / 2 vCPU target has constrained process/database capacity; no unrelated suite code was changed. Full-suite acceptance remains unverified.
- The unresolved full-suite validation is tracked once in [INV-20261124-001](../../../../task/investigation/INV-20261124-001-stock-adjustment-inventory-suite.md). No causal attribution to this feature is made without a clean baseline.
