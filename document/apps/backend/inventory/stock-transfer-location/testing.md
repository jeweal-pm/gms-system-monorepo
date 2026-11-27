# Testing: inventory / stock-transfer-location (SA rev 1, ADR-0060)

Rules: [automated-testing](../../../../workflow/automated-testing.md). The DB integration tests use the existing harness
(`backend-api-inventory/test/support/harness.ts`): a disposable PostgreSQL, the inventory app running as `gms_inventory_app`, and
the REAL master internal controller and services (no mocked master).

## Environment of the recorded run (2026-11-27)

Branch `feat/24-11-26-stock-transfer-location`, uncommitted working tree on top of `047a10c`. Disposable `postgres:18.6-alpine`
container `stl-it-pg` (tmpfs, 512 MB, `127.0.0.1:55450`, no project volume, removed afterwards). Build order: auth migrations
(`?schema=auth`), master migrations (`?schema=partner`, incl. `20261124120000_stock_id_issue`),
`provision-inventory-authz-reader.sql`, `provision-inventory-roles.sql`, then inventory migrations as `gms_inventory_migrator`
(incl. `20261124120000_stock_transfer_location`). Both new migrations applied cleanly on the fresh database.

## Test files

| File | Cases |
|---|---|
| `backend-api-inventory/test/stock-transfer-location/domain.test.ts` | UT-STL-01 cost split (PER_CT / PER_PCS, remainder on a whole move), UT-STL-02 D7 checks, UT-STL-03 input schema (one lot per row, amount, ≤ snapshot, 3 dp, 1–200, strict), UT-STL-04 picker cursor, UT-STL-05 Stock Card registry |
| `backend-api-inventory/test/stock-transfer-location/stock-transfer.db.integration.test.ts` | IT-STL-01 partial move, 02 whole move + picker, 03 Stock Card OUT / IN with the number and `→` / `←` account, 04 stale on hand → 409 and nothing written (pre-check and locked apply), 05 location / unavailable / validation codes, 06 approval ON flow + summary + pending + notifications, 07 revise once / reject / APPROVAL_OFF / DRAFT applied when OFF, 08 edit after effect (reverse + re-apply), delete, Stock Card nets to zero, restore, 09 IN_USE (reserved new stock; source changed) and the Load in-use rule, 10 Stock ID issue replay / append / stale, 11 picker filters and keyset, 12 grants and CSRF per route, 13 options / next number, NP-STL query budget |
| `backend-api-inventory/test/stock-card/domain.test.ts` | UT-SC-01 kind list updated with the 4 transfer kinds; UT-SC-02 (registry covers the migration CHECK) passes with the new list |
| `backend-api-master/test/inventory-internal/stock-id-issue.test.ts` | UT-STL-M01 numbering key + issue body + type allow-list, UT-STL-M02 replay / stale rules |

## N+1 review (every endpoint that queries data)

Counted with the harness statement counter (`measured`, BEGIN / COMMIT / `SELECT 1` excluded; authorization is in-memory in the
harness). Observed in NP-STL:

| Endpoint | Statements | Grows with rows? | Strategy |
|---|---|---|---|
| `GET /stock-transfer-location` (daybook) | 1 | no | one keyset statement, limit + 1, totals stored on the header |
| `GET /stock-transfer-location/{id}` | 2 | no (1 or many lines) | header (+ approval switch subquery); lines LEFT JOIN source and new stock |
| `GET /stock-transfer-location/stock` | 1 | no | one keyset statement on `stock_picker_idx` |
| `GET /approval/pending?type=stock-transfer-location` | 1 | no | one keyset statement on `stock_transfer_pending_idx` |
| `GET /approval/summary` | +1 for the type | no | one capped count |
| `GET /stock-transfer-location/options`, `next-number` | 0–1 + master | no | master reference / numbering; local max |
| `POST /stock-transfer-location` (approval OFF) | 12 for 1 line and 12 for 3 lines | no | pre-tx: switch peek + source read (1 each); tx: switch FOR SHARE, advisory lock, max, header insert, lines insert, then apply = lock, sources UPDATE, new rows INSERT … SELECT, photo copy, ledger insert, line write-back (6) |
| `PUT`, `approve` | bounded like create (+ reverse 6 when applied) | no | same set-based helpers |
| `POST /{id}/delete` of an applied transfer | 10 for 1 line and 10 for 3 lines | no | guarded update, header, reverse (read, lock, ledger, sources, new rows, lines), revision, delete flag |
| Stock Card transactions | unchanged 2 | no | the TRANSFER account is a correlated scalar in the same statement, evaluated only for transfer rows |

Master calls per Save: location resolve + numbering (create only) + one Stock ID issue (only when the Save applies), all
before the transaction. The Stock ID issue in master is ≤ 5 statements whatever the count.

## Results (backend verification record, 2026-11-27)

| Command | Result |
|---|---|
| `backend-api-inventory`: `npx tsc --noEmit -p .`, `npx eslint src "test/**/*.ts"` | clean |
| `backend-api-master`: `npx tsc --noEmit -p .`, `npx eslint src "test/**/*.ts"` | clean |
| inventory `npx vitest run test/stock-transfer-location` | 2 files, **26 passed** (domain 12 + IT 14), NP-STL line above observed |
| inventory `npx vitest run` (full, fresh DB) | 19 files; **239 passed**, 2 failed, 4 skipped. Both failures are outside this change: `test/stock-value/zz-adhoc-perf.test.ts` (committed ad-hoc script that connects to a hard-coded `127.0.0.1:55432/f1_perf`), and IT-SV-S1 "probe is not run" (EXPLAIN-plan assertion on the CURRENT-mode Stock Value list, whose SQL this change does not touch; it passes when the file runs alone, and also fails in a full run without the new transfer tests) |
| master `npx vitest run` (full, fresh DB) | 92 files; **842 passed**, 1 failed, 18 skipped. The failure, IT-SL-M01, is already on `047a10c`: the sale_consumption down script can't drop `partner.sale_consumption` while `sale_consumption_own_line` (migration `20261124090000`) references it. `stock_id_issue` has no foreign key |
| master `npx vitest run test/inventory-internal` | 6 files passed (incl. UT-STL-M01/M02), 2 DB files skipped without the env |
| Fresh DB `prisma migrate deploy` of `20261124120000_stock_id_issue` (master) and `20261124120000_stock_transfer_location` (inventory, as migrator) | applied |
| Dev stack | both migrations present; the inventory one had been applied on 2026-11-25 before the `kind` widening was added, so the delta (`ALTER COLUMN kind TYPE VARCHAR(32)`) and the new checksum were applied by hand (stock_transfer had 0 rows, nothing dropped). Containers restarted; `GET /api/inventory/v1/stock-transfer-location` without a session → 401 |

Defect found and fixed during the run: `stock_movement.kind` was `VARCHAR(20)`, and `TRANSFER_OUT_REVERSAL` (21 characters) failed on edit / delete. The migration now widens the column to 32 (the existing `MEMO_OUT_RETURN_REVERSAL`, 24 characters, had the same latent limit).

Security reviews: not run by backend (the parent runs `sec-auditor` and `security-auditor` once after frontend).
