# Handoff: purchase → backend (BE-PU-002…005)

- Feature ID / UI revision: `purchase` / UI revision 1 (approved 2026-11-04) plus the revision 2 pickers (Add Memo Stock / Add Purchase Order).
- SA revision / source UI revision: **SA revision 1** / UI revisions 1–2.
- From role/scope: SA (`document/apps/backend/master/purchase/**`, `document/adr/0042-*`, the backend rows and FE-PU-003…005 contract notes of `document/task/todo/purchase.md`, `document/diagram/purchase-flow.md`).
- To role/scope / parent integration owner: backend (`senior-nestjs-developer`). The parent owns `backend-api-master/src/app.module.ts`, `document/task/index.md`, `frontend-latest.md` and `tech-stack.md`.
- Exact TODO IDs and source documents: BE-PU-002, BE-PU-003, BE-PU-004 and BE-PU-005 in [todo/purchase.md](../../task/todo/purchase.md). Bundle:
  - [decisions](../../apps/backend/master/purchase/decisions.md) (SA-PU-01…20, R2-D-01…07, defaults D1…D13)
  - [api-contract](../../apps/backend/master/purchase/api-contract.md)
  - [database-diagram](../../apps/backend/master/purchase/database-diagram.md)
  - [sequence-diagram](../../apps/backend/master/purchase/sequence-diagram.md)
  - [architecture](../../apps/backend/master/purchase/architecture.md)
  - [authorization](../../apps/backend/master/purchase/authorization.md)
  - [error-handling](../../apps/backend/master/purchase/error-handling.md)
  - [dependencies](../../apps/backend/master/purchase/dependencies.md)
  - [testing](../../apps/backend/master/purchase/testing.md)
  - [ADR-0042](../../adr/0042-purchase-document-and-stock-deduction.md)
  - [flow](../../diagram/purchase-flow.md)
- Approval status, approved revision, and owner evidence: **approved**, SA rev 1, 2026-11-04. Owner, relayed by the parent:
  - "backend ทำ api เลย / logic หน้า PU หน้าจอการทำงานของ PU และ PO มีรูปแบบและโครงสร้างข้อมูลที่คล้ายคลึงกัน โดยข้อมูลหลักที่สามารถปรับเปลี่ยนได้ ได้แก่ จำนวน น้ำหนัก และราคา"
  - Clarification: "Purchase ปุ่ม Memo Stock จะตัดจาก stock ของ memo และปุ่ม Purchase Order PU จะตัด stock จากการตัดใบ PO ที่มีการซื้อเข้าเข้ามา"

  Choices the owner did not state are the SA defaults D1…D13. Implement them as written; a change by the owner is a new SA revision.
- Required contract / diagrams / ADRs (summary; the bundle governs):
  1. **Migration** `20261104150000_purchase` (additive). It adds the tables `purchase`, `purchase_line` (source STOCK / PURCHASE_ORDER / MANUAL, `memo_stock_id` + `memo_group`, `purchase_order_line_id`, `stock_id`) and `purchase_charge`. It adds `memo_stock.purchased_pcs/_weight_ct` with `memo_stock_purchased_check` (0 ≤ purchased ≤ sold) and the partial indexes `memo_stock_sold_open_idx` and `purchase_order_line_open_idx`. `memo_stock_balance` is unchanged. Put the rollback text from database-diagram.md in the migration header.
  2. **Procedures** `purchase.options/nextNumber/list/get/create/update/delete/approve/memoStock/purchaseOrderLines`, plus `purchase` in the `currency.options` any-of list. `memoStock.list` is **unchanged**.
  3. **Save** (engine `prepare`): copy the source fields from the database and never trust the browser. Refuse a line discount on picked lines. Check the quantity against current availability with `VALIDATION_ERROR exceeds_available`. **No stock change.** MANUAL and PO lines get a Stock ID from the shared counter, kept by line id. Delete is the engine delete (pending only, no stock change).
  4. **Approve**: a guarded status update, then `takeForPurchase` (sum per key, `FOR UPDATE` in id order on memo_stock then purchase_order_line, re-check PO approved / vendor / currency, guard, ≤ 2 bulk UPDATEs).
     - IN_STOCK: pending → sold, and purchased += q.
     - SOLD: purchased += q.
     - PO: purchased_* += q.

     A short gives `PURCHASE_PENDING_SHORT` (every short line) and rolls back.
  5. **Pickers**: `purchase.memoStock` returns SOLD (sold − purchased) and IN_STOCK (pending) rows, one per status, SOLD first, with counts. `sale` and `locationType` are always `null`. `purchase.purchaseOrderLines` returns approved, open lines with status OPEN / PARTLY_PURCHASED and counts. Both are keyset ≤ 50, `Prisma.sql` with fixed fragments, and escaped `q`.
  6. **Errors**: `documentErrors("PURCHASE", "Purchase", "purchase")`, `purchasePendingShort`, `purchaseStockIdExhausted`. Logs hold ids and counts only.
- Dependency ledger entries and installation status: none. Install nothing.
- Allowed code/document paths:
  - `backend-api-master/prisma/schema.prisma`
  - `backend-api-master/prisma/migrations/20261104150000_purchase/migration.sql` (new)
  - `backend-api-master/src/purchase/**` (new: `purchase.schemas.ts`, `purchase.service.ts`, `purchase-stock.ts`, `purchase-pickers.ts`)
  - `backend-api-master/src/document-setup/document-numbering.ts` (`purchase` kind, lock key, `used` kinds)
  - `backend-api-master/src/master/authorization.ts` (`MasterMenu` + `"purchase"`)
  - `backend-api-master/src/master/router.ts` (`purchase` router; `currency.options` list)
  - `backend-api-master/src/master/trpc-handler.ts` (new last constructor parameter `PurchaseService`)
  - `backend-api-master/src/trade-document/memo-receive.service.ts`: **only** an optional `exhausted` error-factory parameter on `issueStockIds`, with no behaviour change for Memo Receive.
  - `backend-api-master/src/trade-document/document-engine.ts`: **only if strictly needed**, a backward-compatible hook. No behaviour change for other documents. Record any such edit in the completion handoff.
  - Tests: `backend-api-master/test/purchase/**` (new), `test/master/{router.test.ts,authorization.test.ts,trpc-handler.http.integration.test.ts,auth-context.http.integration.test.ts}`, `test/document-setup/**`, `test/trade-document/memo-receive*.test.ts`
  - `document/apps/backend/master/purchase/testing.md` (results only), the BE-PU rows' Done / evidence cells in `document/task/todo/purchase.md`, and a completion handoff (append to this file)
  - Not allowed: `backend-api-auth/**` (the catalog leaf exists, and the tree has uncommitted parent work there), nginx / Docker, `memo-stock.service.ts` behaviour, the memo-outstanding services, frontend.
- Integration-owned changes: `backend-api-master/src/app.module.ts` (import and register `PurchaseService`), done through the parent.
- Infra service bundle/revision, ADR/config drift, network/egress and secret-adapter prerequisites (when containers change): none. api-master is unchanged in [service-index](../../infra/service-index.md).
- DevOps pipeline/source revision, Dockerfile/workspace dependencies, build/runtime variables, image platform and release/check requirements (when delivery changes): none beyond the normal image rebuild.
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total):
  - No container, pool, cache or job change. api-master stays at 0.25 vCPU / 384 MiB.
  - Save: ≤ 200 lines.
  - Approve: ≤ 200 + 200 row locks and 2 bulk UPDATEs within `WRITE_TX` 4 s.
  - Lists and pickers: keyset ≤ 50 with one bounded count.
  - Measure the 200-line approve (IT-PU-B06, target < 500 ms).
- Expected output and acceptance criteria: the contract as approved. UT-PU-B01…B05, GP-MT-PU and IT-PU-B01…B07 pass. The full master suite (default and disposable DB), `tsc` and ESLint pass. Dev `migrate deploy` is applied with no drift.
- Verification completed / not run: backend checks done 2026-11-04 (see [Backend completion](#backend-completion-2026-11-04)); both security reviews not run yet (parent).
- Blocking item, if any: none.
- Resume action and destination: backend runs BE-PU-002 → 003 → 004 → 005. Then come both security reviews on the same final source revision, and the completion handoff appended here goes to the parent. The parent pastes FE-PU-004/008/009/010 and resumes frontend at FE-PU-003…005 (plus the rev 2 picker rows) against this contract, then tests and manual-tester.
- Corrective work ID / root-cause ledger link (if applicable): n/a (new feature). Pass limit 3 per [remediation](../../workflow/remediation.md); allocated 0.
- Existing pass limit / allocated passes / active pass (inherit; never reset): 3 / 0 / none.
- Changed evidence, contract, or prerequisite justifying this handoff: SA revision 1 approved 2026-11-04.
- Concrete receiving-role output / next fact needed: a backend completion section with changed files, test commands and results, the dev migration status and any deviation.
- Stop reason / terminal outcome / explicit extension evidence, if any: —
- No commit, push or merge is authorized. Leave `backend-api-auth/*` working-tree changes untouched.

## Backend completion (2026-11-04)

- Role / scope: backend (senior-nestjs-developer), BE-PU-002 → 003 → 004 and the test part of BE-PU-005, against **SA revision 1** (approved 2026-11-04; owner "เริ่ม backend" 2026-11-04). Owner Q-PU-16 ("sold" = Sale-page transactions, Sale not built) is applied as SA D6: the SOLD group is empty in practice, `sale` / `locationType` are `null`, nothing is invented.
- Source revision: HEAD `279d4ad` plus the uncommitted working tree. No commit, push or merge. `backend-api-auth/**`, frontend, nginx and Docker files untouched. `document-engine.ts` **not changed** (no hook needed).
- Integration-owned edit delegated by the parent: `backend-api-master/src/app.module.ts`, import + register `PurchaseService` only.

### Changed files

| File | Change |
|---|---|
| `backend-api-master/prisma/migrations/20261104150000_purchase/migration.sql` (new) | `memo_stock.purchased_pcs/_weight_ct` + `memo_stock_purchased_check`; tables `purchase`, `purchase_line`, `purchase_charge` with the CHECK set, uniques (`purchase_line_memo_stock_key`, `purchase_line_po_line_key`, partial `purchase_line_issued_stock_id_key`), FKs and indexes; `memo_stock_sold_open_idx`, `purchase_order_line_open_idx`; rollback text in the header |
| `backend-api-master/prisma/schema.prisma` | models `Purchase`, `PurchaseLine`, `PurchaseCharge`; `MemoStock.purchasedPcs/purchasedWeightCt` + sold-open index; PO line open index; back-relations on Vendor, VendorAddress, DocumentNumbering, StoneCode, MemoStock, PurchaseOrderLine |
| `backend-api-master/src/purchase/purchase.schemas.ts` (new) | strict create/update (create refuses `lines.N.id`), source rules, duplicates, pcs/weight/price, picked-line discount lock, `photoIds` max 0, list (≤ 366 days), picker inputs |
| `backend-api-master/src/purchase/purchase.service.ts` (new) | engine config + `prepare` + line hook (source columns, Stock IDs kept by line id, PO stone code after the engine check), `get` limits, `options`, `approve` |
| `backend-api-master/src/purchase/purchase-stock.ts` (new) | `completeSourceLines` (save check/copy, no lock, no write), `takeForPurchase` (sum per key, `FOR UPDATE` memo_stock → purchase_order_line in id order, guard, ≤ 2 bulk UPDATEs) |
| `backend-api-master/src/purchase/purchase-pickers.ts` (new) | `purchase.memoStock` (SOLD then IN_STOCK, keyset `g|date|stockId`, one count FILTER query), `purchase.purchaseOrderLines` (keyset `{d,c,i,p,v}`, counts) |
| `backend-api-master/src/purchase/purchase.errors.ts` (new) | `documentErrors("PURCHASE", "Purchase", "purchase")` with 23514 → logged `purchase.check_violation` + `PURCHASE_CHANGED`; `purchasePendingShort`, `purchaseStockIdExhausted` |
| `backend-api-master/src/document-setup/document-numbering.ts` | `purchase` kind, lock key `partner.purchase.plain_running_no`, `used` kinds |
| `backend-api-master/src/master/authorization.ts` | `MasterMenu` + `"purchase"` |
| `backend-api-master/src/master/router.ts` | `purchase` router (grants per authorization.md; `withFieldErrors` on list, pickers, create, update); `currency.options` any-of + `purchase` |
| `backend-api-master/src/master/trpc-handler.ts` | new last constructor parameter `PurchaseService` |
| `backend-api-master/src/trade-document/memo-receive.service.ts` | `issueStockIds(tx, count, now, exhausted = stockIdExhausted)`; Memo Receive behaviour unchanged |
| `backend-api-master/src/app.module.ts` | register `PurchaseService` (delegated) |
| Tests (new) `backend-api-master/test/purchase/{purchase.schemas,purchase.service,purchase-stock,purchase-pickers}.test.ts`, `purchase.db.integration.test.ts` | UT-PU-B01…B04, IT-PU-B01…B06 |
| Tests (extended) `test/master/router.test.ts` (GP-MT-PU), `test/master/auth-context.http.integration.test.ts` + `trpc-handler.http.integration.test.ts` (IT-PU-B07), `test/trade-document/memo-receive.test.ts` (UT-PU-B05), `test/trade-document/memo-receive.db.integration.test.ts` (service map), `test/document-setup/document-setup.service.test.ts` (`used` counts purchases) | |
| Documents | [testing.md](../../apps/backend/master/purchase/testing.md#results-2026-11-04-backend) results; BE-PU-002…005 rows of [todo/purchase.md](../../task/todo/purchase.md); this section |

### Verification

| Check | Result |
|---|---|
| `npx prisma generate` / `npx tsc --noEmit` / `npx eslint src "test/**/*.ts"` | ok / exit 0 / exit 0 |
| `npx vitest run` (default) | 44 files passed, 12 skipped; 475 tests passed, 73 skipped (DB-gated) |
| `vitest run` on the disposable PostgreSQL (`PARTNER_TEST_DATABASE_URL` + `AUTH_TEST_DATABASE_URL`, 127.0.0.1:55440, tmpfs, removed afterwards) | 55 files passed, 1 skipped; 531 tests passed, 17 skipped (other live opt-ins) |
| IT-PU-B06 200-line approve | 40 / 43 / 51 ms (target < 500 ms), 1 UPDATE |
| Migration | fresh disposable DB: 28 migrations applied; dev: "Applying migration `20261104150000_purchase`", healthy, `node docker/repair-dev-networks.cjs` OK, `migrate status` up to date; `migrate diff` (both DBs): no purchase drift (only the older unrelated `stored_files_one_ready_source_key` line) |
| Live smoke through nginx | sign-in 200, refresh 204; `purchase.options/memoStock/purchaseOrderLines/nextNumber/list`, `currency.options` 200; bad cursor 400 `VALIDATION_ERROR`; create without CSRF 403 `CSRF_INVALID`; create → get → approve 200; re-approve 409 `PURCHASE_STATUS_INVALID` (details in testing.md) |

Dev data changed by the smoke: one APPROVED purchase `1` (id `01a1a54a-51d7-79b7-ba73-9c8ce47150ce`, vendor V001, ref "BE smoke") and Memo Stock item 260002 moved 1 pc / 0.050 ct from pending into sold + purchased. No Stock ID was issued. Dev has no Document Setup row for `purchase`, so it numbers plainly (`1`, `2`, …) until one is saved.

### Contract notes and deviations (none change the approved API shape)

1. **Extra file** `src/purchase/purchase.errors.ts` (inside the allowed `src/purchase/**`), so the service, stock and picker files share the error factories without a circular import.
2. **CHECK tightened:** `purchase_line_source_check` also requires `memo_stock_id IS NULL` on non-STOCK lines (the diagram's rule allowed a MANUAL / PO row carrying a `memo_stock_id` with a null group).
3. **Approve-time invalid PO** (unreachable while approved POs are read-only): reported inside `PURCHASE_PENDING_SHORT` as `lines.N.purchaseOrderLineId` / `invalid_reference`, following the sequence diagram and error-handling table. SA-PU-06's `PURCHASE_REFERENCE_INVALID` applies at save, as implemented.
4. **Field errors:** list, both pickers, create and update validate with `withFieldErrors`, so zod refusals return `VALIDATION_ERROR` with `{path, code}` (`required`, `not_allowed`, `duplicate`, `before_from`, `range_too_long`, …) after the grant. An unknown key (for example `lines.N.id` on create) is `lines.N` / `unrecognized_keys`.
5. **`purchase.purchaseOrderLines`** returns `counts {all, open, partlyPurchased}` as in the contract's type comment (the procedure table showed only `{items, nextCursor}`).
6. **Logs:** `purchase.created/updated/deleted` are the unchanged engine events (actorId, id, docNo or version; no line counts). `purchase.approved` carries `lineCount`, `memoStockKeys` and `purchaseOrderKeys`. No prices, quantities or names are logged.
7. **Saved line ids on update:** a line that sends its saved `id` keeps that row id (Memo Receive pattern). It keeps its issued Stock ID only when both the saved and the new line are non-STOCK. A STOCK line always takes its item's Stock ID. An id that is not on the document → `VALIDATION_ERROR lines.N.id` / `unknown_line`.
8. Engine typing: Purchase lines pass through `TradeDocumentEngine` with a type cast, because the engine types `source` as `"MANUAL"`. The engine writes `line.source` as given, so no engine change was needed.
9. Dev-mode tRPC errors include a `stack` field (existing non-production behaviour for every procedure; not changed here).

### Open items

- BE-PU-005: both security reviews (`sec-auditor`, `security-auditor`) once on this source revision, routed by the parent. Results go to the existing [testing.md](../../apps/backend/master/purchase/testing.md) "Security review before handoff" table.
- Changelog entry under `document/changelog/` and `document/task/index.md` are outside the backend's allowed paths here; parent to add if wanted. `tech-stack.md`: no change (nothing installed).
- Frontend resume (parent): FE-PU-003/004/005/009/010 against this contract. Notes: conflict code is `PURCHASE_CHANGED`; save-time over-quantity is `VALIDATION_ERROR exceeds_available`, approve-time is `PURCHASE_PENDING_SHORT`; invalidate `purchase.*`, `purchaseOrder.get` and `memoOutstanding.*` after approve; the PO picker on dev is empty until an approved PO exists.
