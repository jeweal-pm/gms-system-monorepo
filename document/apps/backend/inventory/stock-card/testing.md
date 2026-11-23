# Backend verification: inventory / stock-card

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Approved API/schema/authorization references: [api-contract](api-contract.md), [database-diagram](database-diagram.md), [authorization](authorization.md), [error-handling](error-handling.md), [ADR-0056](../../../../adr/0056-stock-card-report-in-inventory-service.md) (all Proposed; nothing is approved yet)

Rules: [automated-testing](../../../../workflow/automated-testing.md). DB integration tests run against the real PostgreSQL test database through the existing harness (`backend-api-inventory/test/support/harness.ts`, `INVENTORY_TEST_DATABASE_URL`, disposable database, one file at a time, 2 workers max) and the auth DB test setup. No mocked persistence for the report. Test files: `backend-api-inventory/test/stock-card/*.test.ts` (`*.db.integration.test.ts` for DB), master tests beside the hold saga tests, auth tests beside the catalog tests. Planned checks are **not run** until observed.

## Automated coverage

### Inventory (`backend-api-inventory`)

| ID | Target / behavior | Check | Type |
|---|---|---|---|
| UT-SC-01 | `CARD_KINDS` registry | classifies every kind; HOLD_RESERVE / RELEASE_RESERVE are "not a movement"; unknown kind → excluded and reported; visible-Stock-ID rule per document type | unit |
| UT-SC-02 | registry coverage | parses `stock_movement_kind_check` from the migrations and fails when a kind is missing from the registry (guards future modules) | unit |
| UT-SC-03 | Zod schemas | `CardsQuery`, `TransactionsQuery`: bounds, enums, `from ≤ to`, `page ≤ 200`, `q` length, strict unknown keys, `cardKey` pattern; `HoldMetadata` | unit |
| UT-SC-04 | SQL builders | sort map is an enumeration (no user text in SQL), `LIKE` escape of `\ % _`, kind array parameter, mode choice `CURRENT` / `RANGE` | unit |
| UT-SC-05 | entry math | net per document → IN/OUT per dimension, running balance order (date, apply time, id), opening, totals, closing balance with `q` (fixtures incl. opposite-sign pcs / weight) | unit |
| UT-SC-06 | concurrency guard | 2 in flight, third waits ≤ 250 ms then `STOCK_CARD_BUSY`; slot released on error/timeout | unit |
| UT-SC-A1 | route guard | every stock-card route requires `stock-card:VIEW`; super admin passes; other leaves (e.g. `load-to-stock:VIEW`) do not | unit |
| IT-SC-M1 | migration | `card_key` generated and equal for same stone/location/lot (case/space-insensitive), different otherwise; empty stone code falls back to attributes; index exists; new `stock_hold_document` columns; rollback script restores the old shape | integration (DB) |
| IT-SC-L1 | ledger reads | Load 4 pcs → Memo Out 2 → Memo Out Return 2 (through the real hold API) → three rows IN 4 / OUT 2 / IN 2, running balances 4 / 2 / 4, totals IN 6 OUT 2 balance 4; Memo Out row `stockId = null`; Load and Memo Out Return rows have it; `docTypeLabel`s | integration |
| IT-SC-L2 | Reserve is not a movement | Reserve 1 pc: no row, balance unchanged; release: same | integration |
| IT-SC-L3 | edits and deletes | Memo Out 5 → 3 shows OUT 3; delete the Memo Out → no row; edit a Load quantity (`LOAD_ADJUST`) shows the new net; delete the Load → no rows and the card leaves the `CURRENT` list | integration |
| IT-SC-L4 | invariant | after a random sequence of Load / hold / return / edit / delete operations, for every stock `Σ card-kind pcs_delta = on_hand + reserved` and `CURRENT` list = `RANGE` list with no dates | integration (property style, seeded) |
| IT-SC-L5 | dates | balance at Due ignores later-dated documents; with Start the first row's balance includes earlier movements and `opening` matches; a document without metadata falls back to the first-movement Bangkok date (midnight boundary at +07:00) | integration |
| IT-SC-L6 | list | search (stone code, lot, vendor, visible Stock ID; hidden Stock ID does not match), location filter, sort for each enum with `dir`, numbered paging and exact `total`, zero-balance hidden in `CURRENT`, shown in `RANGE` with an entry in range, `vendorName` / `vendorCount`, two stocks with the same stone/location/lot in one card | integration |
| IT-SC-L7 | detail | header (404 unknown and malformed key identical), transactions filters/sort/pages with balance independent of sort and `q`, totals over the whole filtered set, `STOCK_CARD_TOO_LARGE` with a seeded 5,001-entry card | integration |
| IT-SC-A1 | HTTP authorization | 401 without cookie, 403 without `stock-card:VIEW`, 503 when authorization is unavailable, license denied → 403; responses `no-store` | integration (HTTP through the app) |
| IT-SC-B1 | bounds / N+1 | statement count per call recorded by the Prisma query log: list = 1, header = 1, transactions = 2, options = 1, independent of row count (run with 10 and 1,000 stocks) | integration |
| IT-SC-B2 | timeout and busy | a deliberately slow query hits the 5 s limit → `STOCK_CARD_TIMEOUT` (test uses a lowered limit); 3 parallel slow calls → one `STOCK_CARD_BUSY` | integration |
| IT-SC-I1 | internal metadata | PUT with `docDate`/`party` stores them in the same tx; replay of the same revision keeps the stock result and applies the metadata; absent fields leave stored values; hash unchanged; PATCH sets/clears, 404 without a hold document, wrong token → 401; strict body | integration |
| IT-SC-I2 | card after metadata edit | PATCH changes the date and customer without a quantity change → the card row moves to the new date and name | integration |
| IT-SC-R1 | roles | the inventory app role can read the new columns/index and still cannot UPDATE/DELETE `stock_movement` | integration (existing roles test) |

### Master (`backend-api-master`)

| ID | Target | Check | Type |
|---|---|---|---|
| UT-SC-M01 | hold saga payload | `docDate` and `party` (customer id and name) are included for Reserve, Memo Out, Memo Out Return; an older stored op payload without them is sent without the fields | unit |
| IT-SC-M01 | saga to inventory | create / approve / edit / delete of an own-stock Memo Out sends the metadata; date-only edit sends PATCH; PATCH failure does not fail the document save and is logged | integration (real inventory internal API in the harness) |
| IT-SC-M02 | backfill script | `stock-card:backfill` fills existing hold documents; second run changes nothing; rate bound respected; documents without own stock are skipped | integration |

### Auth (`backend-api-auth`)

| ID | Target | Check | Type |
|---|---|---|---|
| UT-SC-C1 | catalog | leaves `stock-card` (VIEW/PRINT/EXCEL) and `stock-value` exist, the old two do not; key pattern, ≤ 64 leaves, updated cell-count assertions and menu list in the tRPC router | unit |
| IT-SC-C1 | grant copy migration | a user with the old primary VIEW gets `stock-card:VIEW`; old consignment → `stock-value`; users without either gain nothing; idempotent (second run no change); removed-leaf grants ignored on read | integration (DB) |

### Manual / measurement (BE-SC-008, results recorded, not claimed in advance)

| ID | Check | Target |
|---|---|---|
| PF-SC-01 | `RANGE` list at 200,000 movements / 20,000 cards, 2 concurrent | p95 ≤ 300 ms; inventory RSS ≤ idle + 40 MiB |
| PF-SC-02 | `CURRENT` list at 50,000 stocks | p95 ≤ 100 ms |
| PF-SC-03 | detail at 5,000 entries | p95 ≤ 150 ms |
| PF-SC-04 | `EXPLAIN` of list and detail statements recorded in the verification note | index use as designed |

Record the exact affected-suite results after edits and the final full results of `backend-api-inventory`, `backend-api-master` and `backend-api-auth` before handoff (`npm run typecheck`, `lint`, `test`, `build` in each; commands discovered from `package.json`).

## Security review before handoff

Follow [security review](../../../../workflow/security-review.md) after tests pass: both reviewers on the same final source revision, once. Focus: authorization of every read, SQL fragment construction (sort/kind arrays), `LIKE` escaping, Stock ID leakage through search/sort/`stockIdExtra`, response size bounds, internal token handling for the new PATCH.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | not run | |
| `security-auditor` | | not run | |

## Service acceptance

| Case ID | Rule / operation / TODO ID | Setup | Action | Expected outcome | Check type | Evidence / result |
|---|---|---|---|---|---|---|
| AC-SC-01 | Balance = book stock (BE-SC-002) | Load 4 pcs, Reserve 1, Memo Out 2 | open list and card | balance 2 (4 − 2 out), Reserve invisible as a row | IT-SC-L1/L2 | not run |
| AC-SC-02 | Stock ID rule (BE-SC-002) | Load, Memo Out, Memo Out Return of one stock | read transactions; search the Stock ID | ID on Load and Memo Out Return rows, `null` on Memo Out; search finds the card and the visible rows only | IT-SC-L1/L6 | not run |
| AC-SC-03 | Dates (BE-SC-002) | documents on 04/09, 18/09, 02/10 | Due 20/09, then Start 10/09 | balance at Due excludes 02/10; first row with Start carries earlier balance; `opening` set | IT-SC-L5 | not run |
| AC-SC-04 | Voided documents (BE-SC-002) | delete a Memo Out | read | row gone, balance restored | IT-SC-L3 | not run |
| AC-SC-05 | Permission (BE-SC-003/007) | users with and without the grant, migrated grant | call every route | 403 / 200 as designed | IT-SC-A1, IT-SC-C1 | not run |
| AC-SC-06 | Metadata (BE-SC-004/005/006) | edit a Memo Out date and customer | read the card | new date and name; backfill repairs old rows | IT-SC-I1/I2, IT-SC-M01/M02 | not run |
| AC-SC-07 | Bounds (BE-SC-003) | 1,000 stocks, 5,001-entry card, slow query | call | statement counts fixed; 422 / 503 codes | IT-SC-B1/B2, IT-SC-L7 | not run |
| AC-SC-08 | Capacity (BE-SC-008) | seeded 200,000 movements | PF-SC-01…04 | targets met or the scale-out ADR is raised | PF-SC | not run |
| AC-SC-09 | Future kinds | add a fake kind to the CHECK in a test database | run UT-SC-02 | the test fails until the registry has a row | UT-SC-02 | not run |

## Results — backend implementation (2026-11-23, SA revision 1, owner "backend ทำ api เลย")

Disposable PostgreSQL 18.6 (`it-pg`, tmpfs): auth migrations, master migrations, roles scripts, inventory migrations (as `gms_inventory_migrator`), service as `gms_inventory_app`.

| Command | Result |
|---|---|
| inventory `vitest run` (full, before the master-metadata file was added) | 11 files, 153 passed; after: stock-card + platform + holds files 6 files, 82 passed (UT-SC-01…06, A1; IT-SC-M1, L1…L7, A1, B1, B2, I1, I2, R1; IT-SC-M01, M02, UT-SC-M01 queued payload) |
| master `vitest run` (full, PARTNER_TEST_DATABASE_URL) | 88 files passed, 2 skipped; 833 passed, 19 skipped |
| auth `vitest run` (full, AUTH_TEST + INVENTORY_AUTHZ_TEST) | 27 files passed, 1 skipped; 127 passed, 7 skipped (UT-CAT-01 356 cells, UT-SC-C1, IT-SC-C1) |
| `tsc --noEmit` inventory / master / auth; ESLint inventory `src`+`test`, master `src`+`test`, auth `src` | clean |
| dev: inventory `20261123090000_stock_card` and auth `20261123100000_stock_card_grants` applied by container recreate; `repair-dev-networks`, nginx reload | applied; containers healthy |
| dev smoke (superadmin, read only): `GET /stock-card/options`, `cards` (CURRENT and RANGE), `cards/{key}`, `cards/{key}/transactions`, bad key | 200 with the contract shapes; 404; anonymous 401 |

N+1 (IT-SC-B1): list 1, RANGE list 1, header 1, transactions 2, options 1 statements with 10 and 310 cards; no master call.

Not run / not met: **PF-SC-01…04 are not signed off.** A partial run on 50,000 stocks / ~205,000 movements (default PostgreSQL settings, work_mem 4 MB, 2 concurrent) gave a CURRENT list p95 of about 393 ms (target 100 ms; sequential scan plus external merge sort of about 36,000 groups), so the CURRENT-mode target is **missed** and needs an optimization or a relaxed target before production sizing; RANGE and detail were not recorded. The opt-in test is `test/stock-card/perf.db.integration.test.ts` (`INVENTORY_PERF_DATABASE_URL`). Security reviews (sec-auditor, security-auditor) skipped at the user's request. Backfill `stock-card:backfill` not run on dev.
