# Frontend acceptance and verification: stock-card

- UI revision: 1 (pending-review)
- Reference image and viewport: S5 / S6 ([source/](source/)), 1920 x 1080 desktop
- Relevant TODO / API / SA revisions: [TODO](../../../task/todo/stock-card.md); SA contract pending ([handoff](../../../coordination/handoffs/stock-card-sa.md))

## Automated coverage

Runner: vitest, files `frontend/test/stock-card/*.test.ts` (`test/**/*.test.ts` only; no DOM renderer is configured, so view logic lives in pure functions in `model.ts`, as `memo-outstanding-vendor` does). Follow [automated testing](../../../workflow/automated-testing.md). Commands and results are recorded here after implementation (none run yet).

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| `model.ts` URL state: parse / serialise `q location from to sort dir page size`, defaults, clamping, invalid values ignored | UT-SC-01 `test/stock-card/model.test.ts` | — | typed fixtures | pass: `test/stock-card/model.test.ts` (UT-SC-01, 8 cases) |
| `model.ts` formatters: pcs, weight with decimal places, `dd/MM/yy` date, empty -> blank cell, Stock ID "+n" | UT-SC-02 same file | — | — | pass: model.test.ts (UT-SC-02) |
| `model.ts` doc-type -> route map (known types link, unknown type renders text) | UT-SC-03 same file | — | one fixture per type | pass: model.test.ts (UT-SC-03; routes checked against the modules' own href helpers) |
| `model.ts` spec-line builder (drops empty parts) | UT-SC-04 same file | — | — | pass: model.test.ts (UT-SC-04) |
| Row number across pages, "Showing a-b out of n" | UT-SC-05 same file | — | — | pass: model.test.ts (UT-SC-05) |
| Date range problem (Due before Start) | UT-SC-06 same file | — | — | pass: model.test.ts (UT-SC-06; only Due before Start is a problem) |
| View-panel preference store (localStorage failure tolerated) | UT-SC-07 `test/stock-card/view-prefs.test.ts` | — | storage stub that throws | pass: `test/stock-card/view-prefs.test.ts` (UT-SC-07, storage that throws; list-return memory) |
| `api.ts` adapter: request building, bounds (page size set, `q` limit), response validation, error mapping (`FORBIDDEN`, `NOT_FOUND`, other) | UT-SC-08 `test/stock-card/api.test.ts` | IT-SC-01 `test/stock-card/api.integration.test.ts` against the real contract once SA/backend finish | fetch stub then the dev service | pass: `api.test.ts` (UT-SC-08, 13 cases) and `api.integration.test.ts` (IT-SC-01, 8 cases, **typed in-memory contract server, not the live service**) |
| Navigation leaf: `REAL_PAGE_HREFS["stock-card"]`, sidebar and Home card show Stock Card and Stock Value | UT-SC-09 `test/home/home-links.test.ts` (update) | — | — | pass: `test/stock-card/navigation.test.ts` (UT-SC-09, 7 cases), `test/home/home-links.test.ts`, `test/home/home-cards.test.ts` |
| Tone map includes `purple` with the new tokens | UT-SC-10 `test/components` or the picker-ui test (update) | — | — | pass: `test/trade-document/picker-ui.test.ts` (UT-SC-10; existing pickers unchanged) |
| Rendered pages (list and detail) with filters, row open, back, doc link | — | IT-SC-02 (browser run by manual-tester, since vitest has no DOM renderer) | live dev stack | not run |

### Results recorded 2026-11-23 (frontend implementation, FE-SC-001…013)

| Target | Case IDs and file | Result |
|---|---|---|
| List table, transactions table, header block, back link, empty / error / skeleton, toolbar pieces (location select, date range, print / Excel icons), Customize view panel, print views (rendered to markup; no DOM runner exists) | UT-SC-11…14 (component markup) in `test/stock-card/components.test.ts`, 29 cases: row states and group tints, blank other-direction cells, DOC NO link only for known types, Total from the server, "—" Stock ID, view switches, locked columns, Excel `aria-disabled`, print scope text | pass |
| Pages `stock-card-list-page.tsx`, `stock-card-detail-page.tsx` (router, queries, debounce, selection, print wiring) | logic is in `model.ts` / `api.ts` / `view-prefs.ts` and covered above; the wiring itself needs a browser | **IT-SC-02 not run** (manual-tester) |
| Whole flow list -> card -> header + transactions | IT-SC-01 `test/stock-card/api.integration.test.ts` (typed in-memory server that follows the SA revision 1 contract) | pass; **live service not checked** (waits for BE-SC-009) |

Commands (run in `frontend/`): `npx vitest run test/stock-card` -> 6 files, 89 tests pass (model 25, view-prefs 7, api 13, components 29, api.integration 8, navigation 7). `npx vitest run` (full frontend suite) -> 139 files, 1292 tests pass. `npx tsc --noEmit -p .` -> no errors. `npx eslint` on `src/features/stock-card`, `src/app/(app)/report`, `src/features/home/navigation.ts`, `src/features/trade-document/picker-ui.tsx`, the Memo Outstanding customize panel and the changed tests -> no findings. `next build` and the browser acceptance cases TC-SC-01…14 were **not run** in this pass.

If a runner cannot execute a component test, the TODO item stays `needs-validation` and an integration-blocker is recorded per the workflow.

## Security review before handoff

Follow [security review](../../../workflow/security-review.md) after tests pass. Both reviewers on the same final source revision; link investigation tickets.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## UI acceptance

Expectations derive from the owner design and these documents, not from invented business rules.

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-SC-01 | FE-SC-004 list | stock exists | open Report › Stock Movement › Stock Card | title, toolbar, header with purple BALANCE group, 56 px rows, pager as S5 | 1920 | not run |
| TC-SC-02 | FE-SC-004 | list | hover a row, tick a checkbox | hover `#F6FAFA`, ticked `#E5F3F2` with filled checkbox (S2); BALANCE cell tint stays | 1920 | not run |
| TC-SC-03 | FE-SC-004 | list | type a stone code / lot / vendor | list narrows after 300 ms, URL `q` set, page 1 | keyboard | not run |
| TC-SC-04 | FE-SC-004 | list | choose a location, dates | URL updates, empty state with Clear filters when nothing matches | — | not run |
| TC-SC-05 | FE-SC-004 | list | click a row; press Enter on a focused row; click only the checkbox | detail opens for the first two; checkbox does not navigate | keyboard | not run |
| TC-SC-06 | FE-SC-005/006 detail | detail open | read header and rows | header block, IN green / OUT orange / BALANCE purple cells, running balance, Total row as S6; blank cells for the other direction | 1920 | not run |
| TC-SC-07 | FE-SC-006 | detail | click a DOC NO | that document's page opens (not the row); browser Back returns with filters | — | not run |
| TC-SC-08 | FE-SC-008 back link | detail | hover, click "‹ Stock Card" | pill `#E2F0F0` on hover (S3); returns to the list with its filters | keyboard focus ring | not run |
| TC-SC-09 | FE-SC-006 | detail | pick Start/Due; sort another column | Total IN/OUT of filtered rows; Total BALANCE = closing balance; rows keep their running balance (Q-SC-07/22) | — | not run |
| TC-SC-10 | FE-SC-004/011 | list | select rows, print | print view lists the selected rows with filters and a printed time; Excel disabled with tooltip | print preview | not run |
| TC-SC-11 | FE-SC-012 | list | open the columns panel, hide Lot, reload | the column stays hidden (per browser); Stone Code and BALANCE cannot be hidden | — | not run |
| TC-SC-12 | FE-SC-004/005 | loading / error / empty / no access / wrong key | simulate each | texts and Retry per [error-handling](error-handling.md) | — | not run |
| TC-SC-13 | FE-SC-010 | user with and without the grant | open the Report menu | Stock Card and Stock Value items; Stock Value is a placeholder; no access text without VIEW | — | not run |
| TC-SC-14 | FE-SC-004 | 1,000+ cards | page through | each request returns at most 50 rows; page change under 1 s on dev | — | not run |

Typecheck, lint and build commands: `frontend/package.json` scripts (record the exact commands and results here after implementation). Customer reports and screenshots go under `document/testing/user-check/` after manual-tester runs.
