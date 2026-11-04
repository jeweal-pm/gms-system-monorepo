# Backend verification plan: master / purchase (SA revision 1, approved 2026-11-04)

Follows [automated testing](../../../../workflow/automated-testing.md). Backend fills the Result column and the commands after BE-PU-005. Integration tests run against a disposable PostgreSQL (tmpfs, no project volume), as in [decimal-setup testing](../decimal-setup/testing.md). All test paths are under `backend-api-master/test/`.

| ID | Kind | Target / behaviour | Path | Result |
|---|---|---|---|---|
| UT-PU-B01 | unit | `purchase.schemas`. It is strict and refuses unknown keys. Source rules: STOCK needs memoStockId + memoGroup; PURCHASE_ORDER needs purchaseOrderLineId; MANUAL has neither. Duplicates (memoStockId × group, PO line). pcs/weight > 0, price > 0, a picked line's discount must be NONE, photoIds max 0, create refuses `lines.N.id`, 1..200 lines, dates, `memoStock` / `purchaseOrderLines` inputs (status enums, ≤ 366 days, limit ≤ 50) | `purchase/purchase.schemas.test.ts` | pass |
| UT-PU-B02 | unit | `prepare`: copies source fields and overwrites the browser's values; foreign vendor or currency / PO not APPROVED → REFERENCE_INVALID with the line path; quantity over current availability → VALIDATION_ERROR `exceeds_available`; no stock write at Save (Prisma mocked) | `purchase/purchase.service.test.ts` | pass |
| UT-PU-B03 | unit | `takeForPurchase`: sums per key (two lines of one item, IN_STOCK + SOLD of one item), short paths for every short line, SQL fragments fixed (no input interpolation), no UPDATE when short | `purchase/purchase-stock.test.ts` | pass |
| UT-PU-B04 | unit | Picker cursors (encode/decode, invalid → VALIDATION_ERROR), amount by available basis, OPEN vs PARTLY_PURCHASED, `sale` / `locationType` null | `purchase/purchase-pickers.test.ts` | pass |
| UT-PU-B05 | unit | `issueStockIds` with the `exhausted` factory → `PURCHASE_STOCK_ID_EXHAUSTED`; Memo Receive default unchanged | `trade-document/memo-receive.service.test.ts` (extend) | pass |
| GP-MT-PU | unit (router) | Every `purchase.*` procedure: the grant per [authorization](authorization.md), CSRF on mutations, validation after the grant, domain codes kept; `currency.options` accepts `purchase:VIEW`; `memoStock.list` still refuses `purchase:VIEW` | `master/router.test.ts` | pass |
| IT-PU-B01 | integration | Migration `20261104150000_purchase` on a fresh DB and on a DB with memo stock rows: columns default 0, `memo_stock_purchased_check` (23514 on purchased > sold), line source shape CHECKs, partial uniques (issued Stock ID, memo stock × group, PO line) | `purchase/purchase.db.integration.test.ts` | pass |
| IT-PU-B02 | integration | **Memo Stock approve:** IN_STOCK moves pending → sold + purchased and `memo_stock_balance` holds; SOLD row (sold set in the fixture) only adds purchased; two pending purchases of the same quantity → the first approve succeeds, the second gets `PURCHASE_PENDING_SHORT` and changes nothing (status stays pending); parallel approvals of different items do not deadlock; Memo Outstanding › Vendor shows the quantity in Sold and Outstanding drops; a fully bought item leaves the report | same | pass |
| IT-PU-B03 | integration | **PO approve:** `purchased_*` added under the lock; ordered − purchased guard; two purchases of one PO line → second short; PO picker hides fully purchased lines, counts OPEN / PARTLY_PURCHASED; a non-approved PO or another vendor's PO → REFERENCE_INVALID | same | pass |
| IT-PU-B04 | integration | Lifecycle: create (number from Document Setup `purchase`, Stock IDs for MANUAL / PO lines from the shared counter, STOCK keeps the item's), update keeps Stock IDs by line id, stale version → CHANGED, delete pending (no stock change), approve → update/delete STATUS_INVALID; Document Setup `used` counts purchases; `purchase.get` gives `limitPcs` for pending source lines and null after approve | same | pass |
| IT-PU-B05 | integration | `purchase.memoStock`: vendor + currency scope, SOLD-first order across pages, counts with q and dates, Reserved quantity never listed, q escaping `%` `_` `\` | same | pass |
| IT-PU-B06 | integration (measure) | Approve with 200 STOCK lines on distinct items: latency recorded (target < 500 ms), one UPDATE per table | same | pass |
| IT-PU-B07 | integration (HTTP) | `trpc-handler` passes `PurchaseService`; JWT / authz view / license / CSRF through HTTP for one query and one mutation | `master/trpc-handler.http.integration.test.ts`, `master/auth-context.http.integration.test.ts` (extend) | pass |

Regression (done 2026-11-04, see Results): run the full `backend-api-master` suite (default and disposable DB), `tsc --noEmit` and ESLint. The Memo Return, Memo Out, Reserve, Memo Out Return, Memo Outstanding and Purchase Order suites must pass unchanged.

Then both security reviews (`sec-auditor` and `security-auditor`) run once on the same final source revision (BE-PU-005).

## Results (2026-11-04, backend)

- Source revision tested: HEAD `279d4ad` plus the uncommitted working tree of 2026-11-04 (`backend-api-master` purchase changes; the parent's local `backend-api-auth` edits were not touched and not part of this run). Run by backend (senior-nestjs-developer).
- DB integrations: a throwaway `postgres:18.6-alpine` at `127.0.0.1:55440`, tmpfs data, no project volume, 256 MB. Auth (`DATABASE_URL=… npx prisma migrate deploy` in `backend-api-auth`, read-only use) and master migrations (28, including `20261104150000_purchase`) applied with `migrate deploy`; the container was removed afterwards.
- Extra case paths beyond the table: UT-PU-B04 also covers the query building in `test/purchase/purchase-pickers.test.ts`; the `currency.options` / `memoStock.list` grant checks of GP-MT-PU are also exercised over HTTP in IT-PU-B07. Document Setup `used` counting purchases is unit-tested in `test/document-setup/document-setup.service.test.ts` and checked on PostgreSQL in IT-PU-B04.

| Command | Result |
|---|---|
| `backend-api-master`: `npx prisma generate` | ok (Prisma Client 7.10.0) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src "test/**/*.ts"` | exit 0 |
| `npx vitest run` (default) | 44 files passed / 12 skipped; 475 tests passed / 73 skipped (DB-gated) |
| `PARTNER_TEST_DATABASE_URL=… AUTH_TEST_DATABASE_URL=… npx vitest run` (disposable DB) | 55 files passed / 1 skipped; 531 tests passed / 17 skipped (other live opt-ins) |
| `vitest run test/purchase/purchase.db.integration.test.ts -t IT-PU-B06` ×3 | 200-line approve **40 ms, 43 ms, 51 ms** (target < 500 ms); exactly 1 `UPDATE` (memo_stock; no PO keys) |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (disposable DB and dev DB) | no purchase / memo_stock / purchase_order_line difference; only the older, unrelated `stored_files_one_ready_source_key` line |
| Dev: `docker restart gms-system-monorepo-api-master-1` (start command runs `migrate deploy`), then `node docker/repair-dev-networks.cjs` | log "Applying migration `20261104150000_purchase`" … "All migrations have been successfully applied"; watch build "Found 0 errors"; healthy; network repair OK; `prisma migrate status` "Database schema is up to date"; the 22 existing `memo_stock` rows have `purchased_*` = 0 and `memo_stock_purchased_check` exists |

### Live smoke (dev stack through nginx `http://127.0.0.1:8080`, super admin, 2026-11-04)

| Call | Result |
|---|---|
| `POST /api/auth/sign-in/username` (Origin `http://localhost:8080`), `POST /api/auth/refresh` (`x-gms-csrf: 1`) | 200, 204; `gms_access` / `gms_refresh` cookies set |
| `purchase.options` | 200: 9 vendors, currencies EUR/GBP/HKD/JPY/THB/USD, company THB, `numbering.configured: false` (no Document Setup row for `purchase` on dev, so plain numbers) |
| `purchase.memoStock` (vendor V001, THB) | 200: 3 IN_STOCK rows (Stock IDs 260003/260002/260001), counts `{all 3, sold 0, inStock 3}`, `sale: null`, `locationType: null` (D6) |
| `purchase.purchaseOrderLines` (V001, THB) | 200: empty, counts 0 (no purchase order exists on dev) |
| `purchase.nextNumber`, `purchase.list`, `currency.options` | 200 (`docNo "1"`), 200 (empty), 200 |
| `purchase.memoStock` with `cursor: "zzz"` | 400 `VALIDATION_ERROR` `[{cursor, invalid}]` |
| `purchase.create` without `x-gms-csrf` | 403 `CSRF_INVALID` |
| `purchase.create` (1 STOCK line, Stock ID 260002, IN_STOCK, 1 pc / 0.050 ct, 6,500; the browser sent placeholder stone fields and `PER_PCS`) | 200 `{docNo "1", version 1, stockIds ["260002"]}`; stock unchanged after save |
| `purchase.get` | 200: server-copied fields (Ruby, lot CGC-R2610-02, location Memo, `PER_CT`), amount 325.00, `limitPcs 120` / `limitWeightCt 5.400`, Memo No. MR-1001 |
| `purchase.approve` | 200 `{version 2, status APPROVED, lineCount 1}`; item 260002 pending 120 → 119 / 5.400 → 5.350, sold 0 → 1 / 0.050, purchased 0 → 1 / 0.050, version 1 → 2, balance holds; `get` limits now null |
| `purchase.approve` again | 409 `PURCHASE_STATUS_INVALID` |
| Logs | `purchase.created` and `purchase.approved` (`lineCount 1, memoStockKeys 1, purchaseOrderKeys 0`); ids, doc no and counts only |

Dev data changed by the smoke: one APPROVED purchase `1` (id `01a1a54a-51d7-79b7-ba73-9c8ce47150ce`, vendor V001, ref "BE smoke") and Memo Stock item 260002 (1 pc / 0.050 ct moved from pending to sold + purchased). No Stock ID was issued (STOCK line only). There is no un-approve (SA-PU-20); reversing it needs the rollback SQL pattern of the database diagram, restricted to this purchase, plus deleting the purchase row.

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | final backend diff for BE-PU-002…004 (working tree on HEAD `279d4ad`) | pending (routed by the parent) | — |
| `security-auditor` | same revision | pending (routed by the parent) | — |
