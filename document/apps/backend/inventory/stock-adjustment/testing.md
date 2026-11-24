# Testing: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

These tests follow [automated-testing](../../../../workflow/automated-testing.md). Unit tests use Vitest. Integration tests run against the real Postgres used by the existing inventory integration suites (copy the sale suite setup).

| ID | Level | Target | Checks |
|---|---|---|---|
| UT-SAJ-B01 | unit | `schemas.ts` | ranges, ≤ 200 lines, distinct stockUuid, decimals as strings |
| UT-SAJ-B02 | unit | delta / cost math | Δpcs, Δweight, Δcost by price unit; no-change line produces no movement |
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
