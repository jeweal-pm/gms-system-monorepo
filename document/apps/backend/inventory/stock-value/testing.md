# Backend verification: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Approved API/schema/authorization references: [api-contract](api-contract.md), [database-diagram](database-diagram.md), [authorization](authorization.md), [error-handling](error-handling.md), [ADR-0057](../../../../adr/0057-stock-value-report-in-inventory-service.md) (Proposed; work authorized by the owner instruction of 2026-11-23)

Rules: [automated-testing](../../../../workflow/automated-testing.md). DB integration tests run against the real PostgreSQL test database through the existing harness (`backend-api-inventory/test/support/harness.ts`, `INVENTORY_TEST_DATABASE_URL`, disposable database, one file at a time, 2 workers max) and reuse `test/stock-card/support.ts` fixtures. No mocked persistence for the report. Test files: `backend-api-inventory/test/stock-value/*.test.ts` (`*.db.integration.test.ts` for DB). Planned checks are **not run** until observed.

## Automated coverage

### Inventory (`backend-api-inventory`)

| ID | Target / behavior | Check | Type |
|---|---|---|---|
| UT-SV-01 | value math (`value.ts`, `Decimal`) | unit rule (PCS only when every holding Stock ID is per piece), weighting with book balance and with the loaded-quantity fallback, Price list average, cost average, normalisation of a per-piece Stock ID in a per-ct card, Last sale conversion both ways (zero quantity -> unusable), `priceSource` classification (`PRICE_LIST` / `LAST_SALE` / `NONE`), `amount` / `profitLoss` rounding half away from zero (including negative), null rules | unit |
| UT-SV-02 | Zod schemas | `ValueCardsQuery` sorts (`price`, `amount`, `profitLoss` accepted, others rejected), bounds, `from <= to`, `page <= 200`, `q` length, strict unknown keys; `TransactionsQuery` unchanged | unit |
| UT-SV-03 | SQL builders | sort map is an enumeration (no user text in SQL), `NULLS LAST` for the three value sorts in both directions, `LIKE` escape, mode choice `CURRENT` / `RANGE`; the cards and entries fragments are the **same function** as Stock Card's (`groupedCardsSql`, `entriesSql`) | unit |
| UT-SV-04 | shared guard | one instance for both modules: 2 in flight across Stock Card and Stock Value calls, the third waits <= 250 ms then gets the caller's code (`STOCK_VALUE_BUSY` / `STOCK_CARD_BUSY`); slot released on error / timeout; Stock Card's UT-SC-06 passes unchanged against the moved guard | unit |
| UT-SV-A1 | route guard | every stock-value route requires `stock-value:VIEW`; super admin passes; `stock-card:VIEW` and `sale:VIEW` do not | unit |
| IT-SV-M1 | migration | `stock.item_key` and `sale_line.item_key` generated, equal for equal stone (case / space-insensitive, stone code or attributes when empty), different otherwise; `card_key` equal implies `item_key` equal; `sale_line_item_key_idx` exists; the rollback script restores the old shape; Stock Card migration test still passes | integration (DB) |
| IT-SV-P1 | Price list | one Stock ID, `sale_price` 12,500 per ct, 1.240 ct, cost 8,000 -> `price "12500.0000"`, `amount "15500.00"`, `profitLoss "5580.00"`, `PRICE_LIST`, unit CT; two Stock IDs 10,000 / 14,000 per ct with 1 ct each -> `12000.0000`; after a Memo Out of the cheaper one the weights follow the balance; `sale_price = 0` is not a price; a per-piece Stock ID next to a per-ct one is converted value-preservingly; an unpriced Stock ID of a priced card is valued at the card price | integration |
| IT-SV-P2 | fallback weights | a `RANGE` list at a past Due where the card has no balance now still prices from the loaded quantity | integration |
| IT-SV-S1 | Last sale | no Price list: latest approved live Sale line of the same stone wins by (date, created, position); DRAFT / PENDING / REVISION_REQUESTED / REJECTED / deleted / provisional Sales are ignored; other stones do not match, other lots and locations of the same stone do; foreign-currency Sale converted by `exchange_rate`; per-piece line into a per-ct card converted by the line's quantities; `priceRef` carries id, number, date; **no probe row for a card with a Price list** (asserted from the plan or a query counter) | integration |
| IT-SV-S2 | no price | neither source -> `price`, `amount`, `profitLoss` null, source `NONE`, balance still listed, counted in `totals.unpricedCards`; totals skip it; a priced card without cost has `profitLoss = null` and counts in `noCostCards` | integration |
| IT-SV-V1 | engine parity | the TypeScript mirror of `value.ts` equals the SQL result on 200 seeded cards (mixed units, prices, costs, zero weights) | integration (seeded) |
| IT-SV-L1 | list = Stock Card | for the same query, Stock Value rows and Stock Card rows have equal `cardKey`, order (same sort), `balancePcs`, `balanceWeightCt`, `total`, in `CURRENT` and `RANGE` | integration |
| IT-SV-L2 | totals | `totals` = sum over **all** filtered cards, not the page (2 pages of a 60-card set), `pricedCards + unpricedCards = total`, `noCostCards`, amounts as the sum of the rounded row amounts | integration |
| IT-SV-L3 | sorts and paging | each enum sort with `dir`; `price` / `amount` / `profitLoss` nulls last both ways; numbered paging with exact `total`; location filter; search (stone code, lot, vendor, visible Stock ID) | integration |
| IT-SV-L4 | consistency | list `amount` = header `currentAmount` = last chronological row `amount` of the unfiltered detail = detail `totals.amount` (no `q`), for Price list and Last sale cards | integration |
| IT-SV-D1 | detail rows | every row has `price`, `priceSource`, `amount`, `profitLoss`; `amount` = running balance x price rounded 2; `profitLoss` = amount - cost of that balance; sort by `profitLoss` puts nulls last both ways; balances and IN/OUT equal Stock Card's transactions for the same query; Memo Out row `stockId = null`; `opening` valued; filters and sort do not change a row's value | integration |
| IT-SV-D2 | detail bounds | 404 for unknown and malformed key (identical bodies), `STOCK_VALUE_TOO_LARGE` with a seeded 5,001-entry card, `valuation` equals the header's | integration |
| IT-SV-A1 | HTTP authorization | 401 without cookie, 403 without `stock-value:VIEW`, 503 when authorization is unavailable, license denied -> 403; responses `no-store`; a Stock Card-only user is refused | integration (HTTP through the app) |
| IT-SV-B1 | bounds / N+1 | statement count per call from the Prisma query log: list = 1, header = 1, transactions = 2, options = 1, independent of row count (10 vs 1,000 stocks) and of the number of cards that need a Last sale probe | integration |
| IT-SV-B2 | timeout and busy | a deliberately slow query hits the lowered limit -> `STOCK_VALUE_TIMEOUT`; Stock Card + Stock Value calls in parallel -> third gets `BUSY` | integration |
| IT-SV-R1 | roles | the inventory app role can read the new columns and index, still cannot UPDATE/DELETE `stock_movement`; the report transaction is read-only (a write attempt inside it fails) | integration (existing roles test) |
| IT-SV-X1 | Stock Card regression | the whole Stock Card suite (`test/stock-card/**`) passes unchanged after the guard move and exported helpers | integration |

### Master and auth

None. No master or auth code changes; their suites are not required by this feature. `leaf stock-value` is already covered by the catalog tests (UT-SC-C1).

### Manual / measurement (BE-SV-005, results recorded, not claimed in advance)

| ID | Check | Target |
|---|---|---|
| PF-SV-01 | `CURRENT` list at 50,000 stocks / 20,000 cards, half of them without a Price list (probe path), 2 concurrent | p95 <= 600 ms |
| PF-SV-02 | `RANGE` list at 200,000 movements / 20,000 cards, 2 concurrent | p95 <= 800 ms; inventory RSS <= idle + 40 MiB |
| PF-SV-03 | detail at 5,000 entries | p95 <= 200 ms |
| PF-SV-04 | last-sale probe for 20,000 unpriced cards at 200,000 sale lines | <= 250 ms of the list statement |
| PF-SV-05 | one stone with 5,000 sale lines (worst-case probe) | the list stays <= 800 ms; else raise BE-SV-101 |
| PF-SV-06 | `EXPLAIN (ANALYZE, BUFFERS)` of list, header and detail statements recorded in the verification note | index use as designed; if PF-SV-01 misses, test the contingency `stock_active_card_idx` before proposing a relaxed target (Stock Card's own `CURRENT` target was missed, see its [testing](../stock-card/testing.md)) |

Record the exact affected-suite results after edits and the final full results of `backend-api-inventory` before handoff (`npm run typecheck`, `lint`, `test`, `build`; commands from `package.json`).

## Security review before handoff

Follow [security review](../../../../workflow/security-review.md) after tests pass: both reviewers on the same final source revision, once. Focus: authorization of every read (Stock Card grant must not open Stock Value), SQL fragment construction (sort map, kind arrays), the price and cost values bound from statement A into B, `LIKE` escaping, Stock ID leakage, cost inference through Profit/Loss (accepted, SQ-SV-09), response size bounds, the shared guard.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## Service acceptance

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| AC-SV-01 | Price list and Amount (BE-SV-003) | Load 2 pcs 1.240 ct, Sale Price 12,500 per ct, cost 8,000 per ct | open list and card | Price 12,500.0000 "Price list", Cts, Amount 15,500.00, Profit/Loss 5,580.00 | IT-SV-P1 | not run |
| AC-SV-02 | Weighted price (BE-SV-003) | two Stock IDs of one lot, 10,000 and 14,000 per ct | open the card | Price 12,000.0000 | IT-SV-P1 | not run |
| AC-SV-03 | Last sale (BE-SV-003) | Stock ID without Sale Price, an approved Sale of the stone at 9,800 per ct | list | Price 9,800.0000 "Last sale", number and date; a deleted Sale is ignored | IT-SV-S1 | not run |
| AC-SV-04 | No price (BE-SV-003) | neither source | list | "-" in Price / Amount / Profit-Loss, balance shown, counted | IT-SV-S2 | not run |
| AC-SV-05 | Totals (BE-SV-003) | 60 cards over 3 pages | read page 1 | Total = all 60 | IT-SV-L2 | not run |
| AC-SV-06 | Consistency with Stock Card (BE-SV-003) | same query on both reports | compare | same keys, balances, totals; Stock Value amounts consistent in list, header, rows | IT-SV-L1/L4/D1 | not run |
| AC-SV-07 | Permission (BE-SV-004) | users with `stock-card:VIEW` only, `stock-value:VIEW` only, both | call every route | 403 / 200 as designed | IT-SV-A1 | not run |
| AC-SV-08 | Bounds (BE-SV-004) | 1,000 stocks, 5,001-entry card, slow query, parallel calls on both reports | call | statement counts fixed; 422 / 503 codes | IT-SV-B1/B2, IT-SV-D2 | not run |
| AC-SV-09 | Capacity (BE-SV-005) | seeded 50,000 stocks / 200,000 movements / 200,000 sale lines | PF-SV-01...06 | targets met or the contingency / scale-out ADR is raised | PF-SV | not run |
| AC-SV-10 | Rollback (BE-SV-001) | migrated database | run the rollback script | old shape, Stock Card unaffected | IT-SV-M1 | not run |

## Results

None yet (design only).
