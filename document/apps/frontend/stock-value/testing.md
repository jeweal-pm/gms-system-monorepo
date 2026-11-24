# Frontend acceptance and verification: stock-value

- UI revision: 1 (approved by instruction)
- Reference image and viewport: V1 / V2 ([source/](source/)), 1920 x 1080 desktop
- Relevant TODO / API / SA revisions: [TODO](../../../task/todo/stock-value.md); SA contract pending ([handoff](../../../coordination/handoffs/stock-value-sa.md))

## Automated coverage

Runner: vitest, files `frontend/test/stock-value/*.test.ts` (`test/**/*.test.ts` only; no DOM renderer is configured, so view logic lives in pure functions in `model.ts` and components are tested rendered to markup, as Stock Card does). Follow [automated testing](../../../workflow/automated-testing.md). Commands and results are recorded here after implementation (none run yet).

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| `model.ts` URL state for the list (sort keys `location stoneCode lot profitLoss`) and the detail (`date docNo stockId account profitLoss`): parse / serialise, defaults, clamping, invalid values ignored | UT-SV-01 `test/stock-value/model.test.ts` | — | typed fixtures | not run |
| Price-source caption and tooltip: `PRICE_LIST` -> "Price list", `LAST_SALE` -> "Last sale" (+ doc no / date when `priceRef`), `NONE` -> "No price", unknown -> "—" (no Mixed in SA revision 1) | UT-SV-02 same file | — | one fixture per source | not run |
| Unit label: `CT` -> "Cts", `PCS` -> "Pcs", unknown / null -> "—" | UT-SV-03 same file | — | — | not run |
| Money cell formatting: `pricePlaces` 2 and 4, "—" for null, thousands separators, negative sign; weight cell with `weightPlaces`; no arithmetic on money | UT-SV-04 same file | — | decimal-string fixtures, `DEFAULT_DECIMAL_PLACES` and a changed setup | not run |
| Profit/Loss tone: negative -> danger class, zero and positive -> normal text, null -> "—" | UT-SV-05 same file | — | −9300.00, 0.00, 11904.00, null | not run |
| Total rows: list Total (Price / Unit blank, "n without price" and "n without cost" lines, Amount "—" when null) and detail Total (closing values from `totals` / `valuation`) | UT-SV-06 same file | — | totals fixtures incl. `unpricedCards` / `noCostCards` > 0 and 0 | not run |
| "Balance as at dd/MM/yyyy at current prices" line shown only with a Due date | UT-SV-07 same file | — | with and without `to` | not run |
| Row numbers, "Showing a-b out of n", date range problem, `dd/MM/yy` date | UT-SV-08 same file (reuses Stock Card functions) | — | — | not run |
| View-panel preference store (`gms.stock-value.view.v1`, storage failure tolerated; hidden Unit / Price source) | UT-SV-09 `test/stock-value/view-prefs.test.ts` | — | storage stub that throws | not run |
| `api.ts` adapter: request building, bounds (page size set, `q` limit), response validation (unknown enum values tolerated), error mapping (403, 404 `STOCK_VALUE_NOT_FOUND`, 503 busy / timeout, other), `valuation` block and `totals` counts parsed | UT-SV-10 `test/stock-value/api.test.ts` | IT-SV-01 `test/stock-value/api.integration.test.ts` against the real contract once SA/backend finish | fetch stub then the dev service | not run |
| Navigation: `REAL_PAGE_HREFS["stock-value"]`, sidebar item opens the new route and stays active on the detail route, Home card, `menuKeyFor("stock-value")` | UT-SV-11 `test/stock-value/navigation.test.ts`; update `test/stock-card/navigation.test.ts` and `test/home/home-links.test.ts` (they assert the `/modules/stock-value` placeholder today) | — | — | not run |
| Tone map includes `blue` and the purple ticked / blue hover classes; existing pickers and Stock Card unchanged | UT-SV-12 `test/trade-document/picker-ui.test.ts` (update) | — | — | not run |
| Components rendered to markup: list table (66 px rows, group tints, checkbox, Location first, Price caption, Unit, Amount, red negative P/L, "—", Total row), transactions table (4 groups, blank other-direction cells, Current value cells, P&L, Total, DOC NO link only for known types), header block reuse, back link "Stock Value" and its href, view panel, print views (selected rows vs page, Total row), Excel `aria-disabled` | UT-SV-13 `test/stock-value/components.test.ts` | — | typed fixtures | not run |
| Stock Card unaffected by the shared extraction (FE-SV-004) and the new tokens | existing `test/stock-card/**` suites | — | — | not run |
| Rendered pages (list and detail) with filters, row open, back, doc link | — | IT-SV-02 (browser run by manual-tester, since vitest has no DOM renderer) | live dev stack | not run |

## Security review before handoff

Follow [security review](../../../workflow/security-review.md) after tests pass. Both reviewers on the same final source revision; link investigation tickets.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## UI acceptance

Expectations derive from the owner design, the owner's price / amount rules and these documents, not from invented business rules. Numbers in the mock screenshots are fake and are never expected values.

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-SV-01 | FE-SV-006 list | stock exists | open Report › Stock Movement › Stock Value | title, toolbar, header with purple BALANCE group (Pcs, Weight, Price, Unit, Amount) and Profit/Loss, 66 px rows, Total row, pager as V1; Location column before Stone Code | 1920 | not run |
| TC-SV-02 | FE-SV-006 | list | hover a row, tick a checkbox | hover `#F6FAFA` with BALANCE cells darker; ticked `#E5F3F2` with BALANCE cells `#E6E7F0` and a filled checkbox (V4) | 1920 | not run |
| TC-SV-03 | FE-SV-006 | cards with Price list, Last sale and no price | read the Price column | caption "Price list" / "Last sale" under the number; "—" with "No price" and "—" Amount / P/L for a card without any price; Unit "Cts" | 1920 | not run |
| TC-SV-04 | FE-SV-006 | list | verify one row by hand | Amount = balance weight x price as the server states (within the rounding step); P/L as Q-SV-07; a loss is red with a minus sign, a profit is plain | — | not run |
| TC-SV-05 | FE-SV-006 | list with more than one page | read the Total row, change page | Total is identical on every page and covers the whole filtered set; "n without price" / "n without cost" appear when applicable | — | not run |
| TC-SV-06 | FE-SV-006 | list | type a stone code / lot / vendor | list narrows after 300 ms, URL `q` set, page 1 | keyboard | not run |
| TC-SV-07 | FE-SV-006 | list | choose a location, dates (Due set) | URL updates; "Balance as at … at current prices" line; empty state with Clear filters when nothing matches | — | not run |
| TC-SV-08 | FE-SV-006 | list | sort Location, Stone Code, Lot No., Profit/Loss (both directions) | server-sorted; "—" rows last in both directions; sort icon before the Profit/Loss label | keyboard | not run |
| TC-SV-09 | FE-SV-006 | list | click a row; Enter on a focused row; click only the checkbox | detail opens for the first two; the checkbox does not navigate | keyboard | not run |
| TC-SV-10 | FE-SV-007/008 detail | detail open | read header and rows | header block, IN green / OUT orange / BALANCE purple / Current value blue cells, running balance, Price + caption, Amount, PROFIT & LOSS, Total row as V2; blank cells for the other direction | 1920 | not run |
| TC-SV-11 | FE-SV-008 | detail | hover a row | non-group cells `#F6FAFA`, IN `#DBE7E7`, OUT `#EBE6DE`, BALANCE (existing token), Current value `#E7EEF6` (V5) | 1920 | not run |
| TC-SV-12 | FE-SV-008 | detail | click a DOC NO | that document's page opens (not the row); browser Back returns with filters | — | not run |
| TC-SV-13 | FE-SV-007 | detail | hover, click "‹ Stock Value" | pill `#E2F0F0` on hover; returns to the list with its filters | keyboard focus ring | not run |
| TC-SV-14 | FE-SV-008 | detail | pick Start/Due; sort another column | Total IN/OUT of filtered rows; Total BALANCE = closing balance, Total Amount = closing balance x price; rows keep their own values | — | not run |
| TC-SV-15 | FE-SV-011 | list and detail | select rows (list), print | print view carries every column with price captions, filters, printed time and the Total row; Excel disabled with tooltip; no print icon without PRINT | print preview | not run |
| TC-SV-16 | FE-SV-012 | list | open the columns panel, hide Unit and Price source, reload | they stay hidden (per browser); Stone Code, Pcs, Weight, Price, Amount and Profit/Loss cannot be hidden | — | not run |
| TC-SV-17 | FE-SV-006/007 | loading / error / empty / no access / wrong key | simulate each | texts, banners and Retry per [error-handling](error-handling.md) | — | not run |
| TC-SV-18 | FE-SV-010 | user with and without the grant | open the Report menu | Stock Value opens the real page (no placeholder), is active on the detail route; no access text without VIEW | — | not run |
| TC-SV-19 | FE-SV-006 | 1,000+ cards | page through | each request returns at most 50 rows; page change under 1 s on dev (includes the price lookups) | — | not run |

Typecheck, lint and build commands: `frontend/package.json` scripts (record the exact commands and results here after implementation). Customer reports and screenshots go under `document/testing/user-check/` after manual-tester runs.
