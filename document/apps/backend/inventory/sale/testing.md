# Backend verification: inventory / sale (SA revision 1, approved 2026-11-18)

Rules: [automated-testing](../../../../workflow/automated-testing.md). Every added/changed module, function and endpoint gets unit + integration tests in its own service. DB integration tests run against the real PostgreSQL test database (existing harnesses `backend-api-inventory/test/support/harness.ts` and the master DB test setup). No mock stores for persistence paths.

## Automated coverage

### Master (`backend-api-master`)

| ID | Target | Check |
|---|---|---|
| UT-SL-M01 | consumption delta planner | increases/decreases per line, summed per item, path mapping |
| IT-SL-M01 | migration | CHECKs reject sold > qty, sold on manual line; indexes exist; down script |
| IT-SL-M02 | `PUT sale-consumptions` RESERVE | reserve_line.sold += q; memo_stock reserved −= q, sold += q; balance CHECK holds; Reserve stays APPROVED |
| IT-SL-M03 | `PUT` STOCK | pending −= q, sold += q; Purchase SOLD group lists the item with `sold − purchased` |
| IT-SL-M04 | partial | 3 of 10 pcs sold → open 7; picker still lists the line with 7 |
| IT-SL-M05 | idempotency | same revision + hash replays (no double move); changed hash / lower revision → `STALE` |
| IT-SL-M06 | concurrency | two consumptions of one Reserve line in parallel → one 200, one `EXCEEDS_AVAILABLE`, totals correct; no deadlock with a parallel Reserve/Memo Out approval on the same item |
| IT-SL-M07 | Memo Out hold safety | item with Memo Out reserved 2 + Reserve line open 1; Sale asking 2 on the Reserve line → refused; Memo Out quantity untouched |
| IT-SL-M08 | unavailable | Reserve deleted / not approved / other customer / other currency / unknown memo stock → `LINE_UNAVAILABLE`, nothing changed |
| IT-SL-M09 | release | empty set releases all; release below `purchased` → `IN_USE`, nothing changed |
| IT-SL-M10 | Reserve used | auto-approved Reserve update/delete after a sale → `RESERVE_IN_USE` with usedBy; parallel update vs consumption serialises |
| IT-SL-M11 | reads | reserve-lines search (customer, currency, q, dates, exclude, keyset, oldest first, ≤ 1 page query); `prepare` caps incl. add-back with `saleId`; ≤ 4 queries |
| IT-SL-M12 | grants | `memoStock.list` and `currency.options` with only `sale:VIEW` succeed; other menus unchanged; internal routes refuse missing/wrong token |
| IT-SL-M13 | numbering | `transactionKey: sale` resolves and marks used; unknown key refused |
| IT-SL-M14 | reserve.get | lines return `soldPcs/soldWeightCt` |

### Inventory (`backend-api-inventory`)

| ID | Target | Check |
|---|---|---|
| UT-SL-B01 | Zod schemas | bounds, source shape, duplicates, decimals, due ≥ doc date, exchange rate rule |
| UT-SL-B02 | flow rules | canEdit/canDelete/canSubmit/canRestore per status, auto-approved, used, syncing |
| UT-SL-B03 | totals | parity fixtures with master `document-totals` / quotation calculate (line discount, header discount, tax included/excluded, labor, charges) |
| UT-SL-B04 | saga generalisation | `SyncDriver` with Sale store/port; **all existing Load to Stock saga tests pass unchanged** |
| IT-SL-B01 | create ON | DRAFT, number issued, nothing applied, ≤ 2 master calls |
| IT-SL-B02 | create OFF | provisional → APPROVED applied; refusal deletes provisional, never listed |
| IT-SL-B03 | approve | both sources applied; notification to creator in the same tx; Approve Center count drops |
| IT-SL-B04 | approve short | `SALE_SOURCE_SHORT`, back to PENDING_APPROVAL, version consistent |
| IT-SL-B05 | crash between steps | kill after master 200 before tx1 → re-drive completes once (master replays); kill before master call → op re-driven |
| IT-SL-B06 | busy / stale / deleted | `SALE_BUSY`, `SALE_CHANGED`, `SALE_DELETED`, `SALE_STATUS_INVALID`, `SALE_REVISE_LIMIT` |
| IT-SL-B07 | edit/delete auto-approved | re-apply with delta; delete releases; `SALE_IN_USE` path |
| IT-SL-B08 | restore | deleted → DRAFT, nothing applied |
| IT-SL-B09 | approval setting | `sale` row read FOR SHARE; turn-OFF refused while pending/revision sales exist |
| IT-SL-B10 | photos | upload ADD/EDIT only, JPEG/PNG signature, ≤ 5 MiB, key under `files/sale/`, read needs link or own upload, unlink keeps bytes + `stored_file`, limiter 429 |
| IT-SL-B11 | HTTP | auth/CSRF/grant per route (table in [authorization](authorization.md)), body cap, `no-store`, error envelope |
| IT-SL-B12 | N+1 budgets | get ≤ 3 local queries + ≤ 1 master call; list 1 query; save ≤ 2 master calls; approve 1 master call |
| IT-SL-B13 | notifications | SUBMITTED to approvers (not actor), APPROVED/REVISE/REJECT to creator, SSE carries ids only |

## Security review before handoff

Route the final changed source revision (master + inventory) once through `sec-auditor` and `security-auditor`; record results in this file; findings go to `document/task/investigation/` (BE-SL-008).

## Service acceptance

- All master and inventory suites pass (commands and counts recorded here by backend).
- ADR-0054 observable checks pass (IT-SL-M02…M10, IT-SL-B03…B07).
- INF-SL-001 nginx probe recorded by infra.
- Measurement: inventory RSS / p95 for a 200-line approve (shared with BE-LS-012).

## Backend verification record (BE-SL-001…008 backend part, 2026-11-19/20)

Branch `feat/18-11-26-sale` (uncommitted working tree on top of `48ad533`). Disposable PostgreSQL 18.6 (`sl-it-pg`, tmpfs, 127.0.0.1:55433, removed afterwards) built in this order: auth migrations (`?schema=auth`) → master migrations (`?schema=partner`, incl. `20261118090000_sale_consumption`) → `backend-api-auth/prisma/roles/provision-inventory-authz-reader.sql` → `backend-api-inventory/prisma/roles/provision-inventory-roles.sql` → inventory migrations as `gms_inventory_migrator` (incl. `20261119090000_sale`). Inventory ITs run as `gms_inventory_app` against the REAL master internal controller + services (no mocked master). Env: `PARTNER_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `INVENTORY_TEST_DATABASE_URL` (owner, no `?schema`), `INVENTORY_APP_TEST_DATABASE_URL`, `INVENTORY_AUTHZ_TEST_DATABASE_URL`.

| Command (fresh DB) | Result |
|---|---|
| `backend-api-master`: `npx tsc --noEmit -p .`, `npx eslint src "test/**/*.ts"` | clean |
| `backend-api-master`: `npx vitest run` | 84 files passed, 1 skipped; **798 passed**, 17 skipped (IT-BP-M01 did not fail in this run) |
| `backend-api-inventory`: `npx tsc --noEmit -p .`, `npx eslint src "test/**/*.ts"` | clean |
| `backend-api-inventory`: `npx vitest run` | 7 files; **71 passed** (Load to Stock: 45 incl. the roles test, Load to Stock test files unchanged; Sale: 12 unit + 13 DB integration + roles assertions) |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (inventory) | empty: Prisma models match migration `20261119090000_sale` |

Coverage map: master `test/inventory-internal/sale-consumption.test.ts` (UT-SL-M01) and `sale-consumption.db.integration.test.ts` (IT-SL-M01…M14 + NP-SL-M), `test/master/router.test.ts` (IT-SL-M12 unit part); inventory `test/sale/domain.test.ts` (UT-SL-B01…B04, Save normalisation, refusal mapping, `sweepAll`, `sync:redrive` args), `test/sale/sale.db.integration.test.ts` (reads, IT-SL-B01…B13), `test/platform/roles.db.integration.test.ts` (BE-SL-003 seed + grants), existing `test/platform/platform.test.ts` + `test/load-to-stock/*` unchanged and passing (UT-SL-B04 "Load to Stock unchanged").

Fixes made while completing the cancelled master work: master fixture name keys (`vendor/customer_name_key_chk`), test expectations aligned with the stored data (Reserve line price unit from the Memo Stock item, `usedBy {docNo}`, auto-approved Reserve delete), `prepare` customer + addresses in ONE statement (was 2 → prepare 5 > 4 budget), and a circular import (`inventory-internal.service` → `customer-stock-document` → `memo-stock` → `memo-receive` → `memo-out-return` → `memo-out`) that broke `guard.test.ts` ("CustomerStockDocument is not a constructor"); now imported through `memo-out.service`.

### N+1 / query-count evidence (IT-SL-B12, IT-SL-M11, NP-SL-M)

| Endpoint | 1 parent row / line | many | Budget | Strategy |
|---|---|---|---|---|
| `GET /sale/{id}` | 3 statements + 1 master call | 3 + 1 (20 lines) | ≤ 3 + ≤ 1 | header (+ approval switch subquery); lines with photo ids `array_agg` per line; charges; master `prepare` only while editable (0 for read-only) |
| `GET /sale` (Daybook) | 1 | 1 (≤ 51 rows) | 1 | keyset on `sale_list_idx`, snapshots, no per-row lookup |
| `GET /approval/pending?type=sale` | 1 | 1 | 1 | keyset on `sale_pending_idx` |
| `POST /sale` | equal statement count for 1 and 20 lines; 2 master calls | same | Save ≤ 2 master calls | `createMany` lines / charges / photo links |
| `POST /sale/{id}/approve` | equal statements for 1 and 20 lines; 1 master call | same | apply = 1 call | one set-based consumption PUT |
| master `POST sale/prepare` | ≤ 4 | ≤ 4 | ≤ 4 | customer + 2 addresses (json_agg), currency + company, Reserve lines ⋈ headers, Memo Stock (each `= ANY(ids)`) |
| master `POST sale/reserve-lines/search` | 1 | 1 | 1 page query | `reserve_open_customer_idx` ⋈ `reserve_line_open_idx`, `LIMIT limit+1` |
| master `PUT sale-consumptions/{id}` | ≤ 10 | same for 30 lines; replay = 1 | ≤ 10 | id-ordered set locks, one `UPDATE … FROM (VALUES …)` per table |

No unresolved N+1.

### Dev live check (2026-11-20)

`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.gms.dev.yml up --no-deps backend-api-inventory-migrate` applied `20261119090000_sale`; `api-master` (no pending migration) and `backend-api-inventory` restarted (inventory restarted a second time after `tsc --watch` emitted `dist/modules/sale`), `node docker/repair-dev-networks.cjs`, `nginx -s reload`. Superadmin smoke through nginx (read-only, no dev data changed): `GET /sale/options` 200 (first call after restart 503 `MASTER_UNAVAILABLE` once, then 200), `GET /sale/next-number` 200 `{docNo:"1"}` (Document Setup key `sale` not configured in dev: `numbering.configured=false`), `GET /sale` 200, `GET /sale/reserve-lines?customerId=…&currency=USD` 200 (RS-1001 open lines), same customer in THB → empty, `GET /approval/summary` 200 with `{type:"sale"}`, `GET /approval/pending?type=sale` 200, `GET /approval-settings` lists `sale`, unknown Sale 404 `SALE_NOT_FOUND`, unknown photo 404, `POST /sale` without Origin 403 `CSRF_INVALID`, `{}` 422 `VALIDATION_ERROR`.

### Open items

- Security reviews (`sec-auditor` + `security-auditor`, one pass on this source revision) — parent, not run here; BE-SL-008 stays open until recorded.
- DO-SL-001 (devops note), inventory RSS / p95 for a 200-line approve (shared with BE-LS-012).
- Observation for investigation (not changed, outside Sale scope): Load to Stock `insertOp(header.applied_revision + 1)` reuses the revision of a refused op, so a retry after a refused UPDATE/DELETE of the same load would hit `master_sync_op_load_revision_key` (500). Sale avoids it by taking the next free revision.
