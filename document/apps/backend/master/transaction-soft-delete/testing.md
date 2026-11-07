# Testing: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

Follow [automated-testing](../../../../workflow/automated-testing.md). Backend tests live in `backend-api-master/test/`. Unit tests use the existing fake-delegate style (`test/trade-document/memo-documents.test.ts`, `test/quotation/quotation.service.test.ts`). DB tests are `*.db.integration.test.ts` against the disposable PostgreSQL the suite already uses. New files: `test/trade-document/soft-delete.test.ts`, `test/trade-document/soft-delete.db.integration.test.ts`, and quotation cases in the existing quotation test files.

## Unit (UT-SD)

| ID | Check |
|---|---|
| UT-SD-01 | Engine `delete` issues `updateMany` (not `deleteMany`) with `{id, version, status in editable, deletedAt: null}` and data `{deletedAt, deletedBy: actor, version: {increment: 1}, updatedAt, updatedBy}`; returns `{ok: true, version: n+1}` |
| UT-SD-02 | Engine `delete` miss order: missing → NOT_FOUND; deleted → `<CODE>_DELETED`; APPROVED → STATUS_INVALID; else CHANGED |
| UT-SD-03 | Engine `restore`: guard `{id, version, deletedAt: {not: null}}`, clears both, version + 1; miss: NOT_FOUND / STATUS_INVALID (not deleted) / CHANGED |
| UT-SD-04 | Engine `list`: default `deleted=false` → `where.deletedAt = null` on both findMany and count; `deleted=true` → `{not: null}`; other filters and cursor unchanged; item has `deletedAt` |
| UT-SD-05 | Engine `get` returns `deletedAt`/`deletedBy` (null and set) |
| UT-SD-06 | Engine `update` on a deleted row → `<CODE>_DELETED`, before STATUS_INVALID/CHANGED; nothing written (no line deleteMany) |
| UT-SD-07 | Every approve (memo out, reserve, memo receive, memo return, memo out return, PO, purchase) guard includes `deletedAt: null`; a deleted miss → `<CODE>_DELETED` and no stock function is called |
| UT-SD-08 | Quotation delete/restore/list/get as UT-SD-01…05; deletable set `DELETABLE` = DRAFT, PENDING_APPROVAL; APPROVED / REJECTED / CANCELLED delete → `QUOTATION_STATUS_INVALID` (D2) |
| UT-SD-09 | Quotation submit/approve/reject/cancel/update on deleted → `QUOTATION_DELETED` |
| UT-SD-10 | List schemas: `deleted` boolean default false; a non-boolean value → VALIDATION_ERROR `deleted`; strict schemas still refuse unknown keys |
| UT-SD-11 | `errors.ts` has a message for each of the 8 `<CODE>_DELETED` codes |
| UT-SD-12 | Logs: `<event>.deleted` and `<event>.restored` with `{actorId, id, docNo, version}` and no document content |

## Router / grants (GP-SD)

| ID | Check |
|---|---|
| GP-SD-01 | For each of the 8 routers: `restore` needs `<menu>` DELETE (VIEW / EDIT only → PERMISSION_DENIED) and CSRF; `list {deleted: true}` needs VIEW only. Extend `test/master/router.test.ts`. |

## DB integration (IT-SD, disposable PostgreSQL)

| ID | Check |
|---|---|
| IT-SD-01 | `migrate deploy` on a fresh DB and on a copy of dev applies `…_transaction_soft_delete`; `migrate diff` shows no drift; the 8 CHECKs and 8 partial indexes exist |
| IT-SD-02 | CHECK: setting `deleted_at` on an APPROVED engine row, or on a CANCELLED quotation, fails; setting only one of the two columns fails |
| IT-SD-03 | Delete a draft: the row remains with lines, charges and photo links; `stored_files` unchanged; status unchanged; version + 1; no `memo_stock` / `purchase_order_line` change |
| IT-SD-04 | After delete, `nextNumber` and the next create get `max + 1` (the deleted number is not reused, D5); Document Setup `used` is true for that numbering row |
| IT-SD-05 | Normal list hides it, and `total` drops by 1; `deleted: true` lists it with keyset paging across > 50 rows in the same order; filters q/party/date work in both views |
| IT-SD-06 | `get` returns the deleted document with `deletedAt`/`deletedBy`; update / approve on it → DELETED and nothing changes (transaction rolled back) |
| IT-SD-07 | Restore: back in the normal list, editable; save and approve then work and move stock as before (Memo Receive → Memo Stock rows; Purchase → cut) |
| IT-SD-08 | Readers unchanged: a deleted draft Memo Receive / PO / Memo Out never appears in `memoStock.list`, `purchase.memoStock`, `purchase.purchaseOrderLines`, `memoOutReturn.outstanding` or `memoOutstanding.*` |
| IT-SD-09 | Race: concurrent delete and approve with the same version → exactly one succeeds; the other gets CHANGED / DELETED / STATUS_INVALID; the CHECK holds |
| IT-SD-10 | Memo Receive draft with photos and Stock IDs: delete → restore keeps the same Stock IDs and photos (D14, D17) |

Regression: the full master `vitest run` (default and disposable DB), `tsc --noEmit` and ESLint. Existing delete tests that asserted a hard delete are updated to the soft behaviour, not removed.

## Measurement

| ID | What | When |
|---|---|---|
| M-SD-01 | Per table: deleted share (`count(*) FILTER (WHERE deleted_at IS NOT NULL) / count(*)`), and `EXPLAIN (ANALYZE)` p95 of both list views. Revisit D12 if the share is > 10 % or the p95 is > 150 ms. | one month after release; also once on dev seed data in IT-SD-05 |

## Results (2026-11-06, backend BE-SD-002…005)

- Source revision tested: HEAD `dc4c42d` plus the uncommitted `backend-api-master` working tree of 2026-11-06. `backend-api-auth/**` was not edited (its local LAN edits are not part of this change); its migrations were only applied read-only to the throwaway DB. Run by backend (senior-nestjs-developer).
- Disposable DB: `postgres:18.6-alpine` at `127.0.0.1:55440`, tmpfs data, 256 MB, no project volume; auth migrations and all 29 master migrations (incl. `20261106090000_transaction_soft_delete`) by `prisma migrate deploy`; run twice (the second time on a fresh container), removed afterwards.

| Case | Where | Result |
|---|---|---|
| UT-SD-01…07 | `test/trade-document/soft-delete.test.ts` (each case `it.each` over the 7 engine documents) | pass |
| UT-SD-08, UT-SD-09 | `test/quotation/quotation.service.test.ts` (UT-QT-B19 rewritten to the soft delete; restore; list `deleted`; `QUOTATION_DELETED` on update/submit/approve/reject/cancel) | pass |
| UT-SD-10…12 | `test/trade-document/soft-delete.test.ts` (5 list schemas; 8 `<CODE>_DELETED` messages + the PO / Purchase / Quotation messages; `.deleted` / `.restored` logs) plus `explainMiss` / `explainRestoreMiss` order | pass |
| GP-SD-01 | `test/master/router.test.ts` (8 routers: DELETE + CSRF for `restore`, VIEW / EDIT / ADD / APPROVE refused, strict schema, `list {deleted}` with VIEW only, purchase field errors, domain codes kept) | pass |
| IT-SD-01…10 | `test/trade-document/soft-delete.db.integration.test.ts` (7 tests; Memo Receive with photos + Stock IDs, Purchase Order 53 rows / 2 pages, Memo Out, Quotation, race ×5) | 7/7 pass |
| Regression | existing delete tests now assert the soft behaviour: UT-MO-B08, IT-MR-04, IT-MR-08, IT-PO-01, IT-PU-B04, IT-RS-03, IT-QT-01 (APPROVED quotation → `QUOTATION_STATUS_INVALID`, DRAFT → soft delete) | pass |

| Command | Result |
|---|---|
| `npx prisma generate` | ok (Prisma Client 7.10.0) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src "test/**/*.ts"` | exit 0 |
| `npx vitest run` (default) | 45 files passed / 13 skipped; 527 tests passed / 80 skipped (DB-gated) |
| `PARTNER_TEST_DATABASE_URL=… AUTH_TEST_DATABASE_URL=… npx vitest run` (disposable DB) | 57 files passed / 1 skipped; 590 tests passed / 17 skipped (other live opt-ins); same on the fresh container |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (disposable DB) | no soft-delete drift; only the older, unrelated `stored_files_one_ready_source_key` line |
| Dev: `docker restart gms-system-monorepo-api-master-1`, then `node docker/repair-dev-networks.cjs` | "Applying migration `20261106090000_transaction_soft_delete`" … "All migrations have been successfully applied"; watch build "Found 0 errors"; healthy; network repair OK (existing rows were all NULL / NULL, so every CHECK validated) |

### Live smoke (dev stack through nginx `http://localhost:8080`, super admin, 2026-11-06)

| Call | Result |
|---|---|
| `POST /api/auth/sign-in/username` (Origin), `POST /api/auth/refresh` (`x-gms-csrf: 1`) | 200, 204 |
| `purchaseOrder.create` | 200 `{docNo "3", version 1}` |
| `purchaseOrder.delete {expectedVersion 1}` | 200 `{ok: true, version: 2}` |
| `purchaseOrder.list {q: "3"}` / `{deleted: true}` | not listed / listed with `status PENDING_APPROVAL`, `deletedAt` set, `total 1` |
| `purchaseOrder.get` | 200, `version 2`, `deletedAt` and `deletedBy` set, lines kept |
| `update` / `approve` / `delete` on the deleted PO | 409 `PURCHASE_ORDER_DELETED` ×3 |
| `restore` without `x-gms-csrf`; with stale version 1 | 403 `CSRF_INVALID`; 409 `PURCHASE_ORDER_CHANGED` |
| `list {deleted: "yes"}` | 400 BAD_REQUEST (zod `invalid_type` at `deleted`) |
| `purchaseOrder.restore {expectedVersion 2}` | 200 `{id, version 3, status PENDING_APPROVAL}`; again → 409 `PURCHASE_ORDER_STATUS_INVALID` |
| `get` / normal `list` after restore; `update {expectedVersion 3}` | `deletedAt/By` null, listed again; 200 `{version 4}` |
| `quotation.delete` on an APPROVED quotation (OQ-1) | 409 `QUOTATION_STATUS_INVALID` |
| `<doc>.list {deleted: true}` for the other 7 documents | 200 each (`total 0`) |

Dev data left by the smoke: Purchase Order `3` (id `01a1af16-3ea0-79c4-86f5-f35a77846771`, ref "BE soft-delete smoke"), deleted again at version 5 so it shows only under the Deleted filter. M-SD-01 (one month after release) is still open.
