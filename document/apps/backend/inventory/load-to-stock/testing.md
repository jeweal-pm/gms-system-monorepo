# Backend verification plan: inventory / load-to-stock (SA revision 1, pending-review)

Follows [automated testing](../../../../workflow/automated-testing.md). Integration tests use a disposable PostgreSQL (tmpfs, no project volume) with both schemas migrated (`partner` by master's migrations, `inventory` by inventory's) and a real master HTTP process or its Nest testing module bound to a port; no mocked master for IT-*. Backend fills Result and commands.

## Unit

| ID | Target | Path (backend-api-inventory/test/ unless noted) |
|---|---|---|
| UT-LS-B01 | Zod schemas: strict, 1–200 rows, ≤ 200 sources, decimals as strings with scale limits, mode shape (NONE 1:1, SPLIT 1 source/row, MERGE ≥ 2 sources, 1 row), photoIds ≤ 5 unique, required location/stock/sale price, parcel ≤ 50 | `load-to-stock/schemas.test.ts` |
| UT-LS-B02 | Cost: net × rate (rate 1 when the PU is in the company currency), PER_CT by weight, PER_PCS by pcs, 4 dp / 2 dp half-up; Merge totals and row unit price (design numbers 1,387,835.60 ÷ 29.30 = 47,366.40); highest company-currency/pc source with tie rule; merged unit PER_CT unless all PER_PCS | `load-to-stock/cost.test.ts` |
| UT-LS-B03 | Remaining validation incl. owner Q-LS-26 (pcs-0 lines never offered, row pcs ≥ 1, row weight 0 only when the source weight is 0), write-off on close, Split Σ ≤ remaining, edit with own allocation excluded | `load-to-stock/validate.test.ts` |
| UT-LS-B04 | Saga state machine: PREPARED→CONFIRMED→DONE, REFUSED path, timeout keeps PREPARED, backoff, STUCK after 10, stale→reconcile via GET | `platform/sync/sync.test.ts` |
| UT-LS-B05 | Master client: timeouts, retry only on reads, error mapping table | `platform/master-client.test.ts` |
| UT-LS-B06 | Ported auth: JWKS cache limits, CSRF origin rules, grant helper, canApprove, Super Admin | `platform/auth/*.test.ts` |
| UT-LS-B07 | (master) internal guard: inventory token accepted only on `/internal/v1/inventory/*`; partner token refused there; constant-time path | `backend-api-master/test/inventory-internal/guard.test.ts` |
| UT-LS-B08 | (master) allocation delta calculation and request hash replay/stale rules | `backend-api-master/test/inventory-internal/allocation.test.ts` |

## Integration

| ID | Behaviour | Notes |
|---|---|---|
| IT-LS-B01 | Migrations: inventory fresh; master additive migration on a DB with existing purchases (loaded_* = 0, CHECK `purchase_line_loaded_check` 23514 on overload and on STOCK lines, loadable partial index used by EXPLAIN); approval rows removed/CHECK narrowed; down script when no allocation exists | both schemas |
| IT-LS-B02 | Picker: approved + not deleted + MANUAL/PO only, remaining > 0, vendor filter, date range, q escaping `% _ \`, exclusion list, keyset across pages, a closed line disappears | — |
| IT-LS-B03 | **Partial load (owner example):** PU line 10 pcs → OFF Save loads 7 → master loaded 7, picker shows 3, stock created with a `YY####` id; second load of 3 → line closed, weight remainder written off, line gone from picker | approval OFF |
| IT-LS-B04 | ON lifecycle: Save DRAFT (no master write, no IDs), Submit → PENDING (update/delete refused), Revise once → edit → Submit → second Revise refused, Approve → APPROVED + stocks + PU deducted; Reject path changes nothing; notifications + recipients rows | approval ON |
| IT-LS-B05 | Modes: NONE, SPLIT (one line → 3 rows, 3 Stock IDs, own locations), MERGE (2 lines mixed units → 1 row, 1 Stock ID, both lines closed, row_sources 2) | — |
| IT-LS-B06 | **Concurrent approve race:** two pending loads of 7 pcs on a 10-pc line approved in parallel → exactly one APPROVED, the other PENDING with `LOAD_TO_STOCK_EXCEEDS_REMAINING`; same load approved twice in parallel → one success, one CHANGED/BUSY; no deadlock across 20 parallel approvals on overlapping lines | — |
| IT-LS-B07 | **Crash/timeout recovery:** inject failure (a) after tx0, (b) after master commit before tx1, (c) master timeout → re-drive (access / start-up / sweep) converges to one state; master replay returns the same Stock IDs; no duplicate stock; refused path deletes the provisional document | fault hooks in tests only |
| IT-LS-B08 | **Stock ID uniqueness across services:** two sessions, Memo Receive and Load to Stock, with a stale-year clock around Bangkok midnight → no duplicate between `partner.memo_stock`, `partner.load_stock_id` and `inventory.stock` (INV-20261113-001 Part B acceptance) | master |
| IT-LS-B09 | Edit/delete until used (OFF): edit pcs up/down (delta to master), remove row (stock REVERSED, ID retired), add row (new ID), delete (PU remaining restored; no restore endpoint, 404/405); with any stock bucket other than on-hand above 0 (test fixture) → `LOAD_TO_STOCK_IN_USE`, and editable again after the bucket returns to 0 | — |
| IT-LS-B18 | Stock bucket CHECK (`pcs = on_hand + reserved + memo_out + sold + consumed`, weight too) refuses an inconsistent update (23514); `stock_hold` unique per document line | phase 1 schema |
| IT-LS-B19 | Locations (ADR-0053): options list active names only; Save with `"safe a"` stores master spelling `"Safe A"`; inactive/unknown name → `LOCATION_INACTIVE`; an updated row keeps its stored name after the location is renamed/deactivated; PU line location shown but the load row starts empty; one `master-data/resolve` call for 200 rows (NP-LS-04) | master migration `20261116090000_location_master` applied |
| IT-LS-B20 | Header currency = Company Profile currency (non-THB company profile in the fixture), cost conversion at each PU rate | Q-LS-23 |
| IT-LS-B10 | Master guard: Purchase update/delete after a load → `PURCHASE_IN_USE`; before any applied load (draft only) → allowed, and the draft's Approve then fails `LINE_UNAVAILABLE`/`EXCEEDS` | master |
| IT-LS-B11 | Numbering: first Save marks `external_used_at`; Document Setup refuses editing that row; running numbers gap-free per numbering row under 10 parallel creates; preview does not mark | master + inventory |
| IT-LS-B12 | Measure: OFF Save with 200 rows (end-to-end latency, master tx time, inventory RSS delta) — target p95 < 800 ms on dev; record numbers | measurement |
| IT-LS-B13 | Photos: upload JPEG/PNG ≤ 5 MiB, signature refusal, copy from PU line (≤ 5, order), second copy of the same PU photo reuses the file (no new bytes), stored under `files/load-to-stock/` only, no delete API, unlink on edit keeps bytes + metadata | storage tmp dir |
| IT-LS-B14 | Approval settings: list/put, turn-OFF guard with waiting counts, Save follows the committed setting (FOR SHARE), counts only with approval-setup:VIEW | — |
| IT-LS-B15 | HTTP auth chain: no cookie 401, bad origin 403 on mutation, missing grant 403 before input use, license denied 403, auth view down 503; 403 before 404 | real JWT signer from test keys |
| IT-LS-B16 | SSE: connect/ready/ping/reauth, ≤ 3 per user, ≤ 200 per process 503, event ids only, no DB connection held | — |
| IT-LS-B17 | Approve Center endpoints: summary counts capped 100, pending sort/search/keyset, canApprove filtering | — |

## N+1 review (required, senior-nestjs-developer rule of 2026-11-16)

Use Prisma query events (`$on('query')`, counts only, no bind values) for inventory and a request-scoped counter on master's internal controller. Each test runs with **1** and with **many** parents and asserts the same budget.

| Endpoint | Inventory DB queries | Master internal calls | Master DB queries | Test |
|---|---|---|---|---|
| purchase-lines/search (1 vs 50 rows) | 0 | 1 | 2 (page + count) | NP-LS-01 |
| GET /load-to-stock/:id (1 vs 200 rows, 200 sources, 1000 photos) | ≤ 4 (header, sources+rows, row_sources, photos) | 1 (`batch`) | 1 | NP-LS-02 |
| list / Daybook / approval pending (1 vs 50) | 2 (page + count where shown) | 0 | 0 | NP-LS-03 |
| create ON (1 vs 200 rows) | ≤ 8, set-based `createMany` per table | 3 (batch, master-data/resolve, numbering) | 1 each | NP-LS-04 |
| apply (OFF create / approve / edit) (1 vs 200 rows) | tx0 ≤ 6, tx1 ≤ 8 (createMany stock, stock_photo, movement; one `UPDATE … FROM (VALUES …)` for rows) | 1 PUT | ≤ 9 (alloc lock, header locks, line locks, one bulk update, delete+insert lines, lock, counter upsert, insert ids, result) | NP-LS-05 |
| photos/from-purchase-line (1 vs 5 photos) | ≤ 3 + 1 insert per **new** file (bounded ≤ 5) | 1 + ≤ 5 streams (bounded, documented exception) | 1 + 1 per stream | NP-LS-06 |
| notifications list (1 vs 20) | 1 | 0 | 0 | NP-LS-07 |

Any growth per row fails the test. Exceptions are only the bounded ≤ 5 photo streams above.

## Regression and reviews

Run the full `backend-api-master` suite (Purchase, Memo Receive counter, Document Setup, Approval Setting, Approve Center) after the master changes; `tsc --noEmit` and ESLint for both workspaces. Then both security reviews (`sec-auditor`, `security-auditor`) once on the same final source revision (BE-LS-012).

## Results — backend implementation (BE-LS-001…013, 2026-11-17)

Working tree on branch `feat/17-11-26-load` (uncommitted, base `4254526`). Disposable PostgreSQL 18.6 (`it-pg`, tmpfs, 127.0.0.1:55432) built by: auth migrations → master migrations → `backend-api-auth/prisma/roles/provision-inventory-authz-reader.sql` → `backend-api-inventory/prisma/roles/provision-inventory-roles.sql` → inventory migration **as `gms_inventory_migrator`**; the inventory service in the ITs runs **as `gms_inventory_app`**; the master side is the real `InventoryInternalController` + services bound to a port (no mocked master).

| Command | Result |
|---|---|
| `backend-api-auth`: `vitest run` (AUTH_TEST + INVENTORY_AUTHZ_TEST URLs) | 26 files passed, 1 skipped; **121 passed**, 7 skipped |
| `backend-api-master`: `vitest run` (PARTNER_TEST URL, fresh DB) | 82 files passed, 1 skipped; **776 passed**, 17 skipped |
| `backend-api-inventory`: `vitest run` (INVENTORY_TEST / APP / AUTHZ URLs) | 5 files, **43 passed** |
| `tsc --noEmit` auth / master / inventory | clean |
| ESLint: master `src` + `test`, inventory `src` + `test`, auth `src` (its `lint` script) | clean (auth `test/license/license-current.test.ts` has a pre-existing unused import, untouched) |
| `prisma migrate deploy` master + inventory on a fresh DB; inventory build `tsc -p tsconfig.build.json` → `dist/main.js`; smoke start: `/health/ready` 200, unauthenticated API 401 | pass |
| `pnpm audit --prod` | no Hono / node-server advisory (hono 4.13.18, @hono/node-server 2.1.7) |

### Case mapping

| Target | Unit | Integration |
|---|---|---|
| auth license endpoint accepts the inventory token (BE-LS-001) | UT-LS-AUTH-01/02 `backend-api-auth/test/license/license-callers.test.ts` | IT-LS-AUTH-01/02 `master-license.http.integration.test.ts`; IT-LS-AUTH-03 `test/permission/inventory-authz-reader.db.integration.test.ts` (privilege query) |
| master migration, rollback script (BE-LS-002) | — | IT-LS-B01 `backend-api-master/test/inventory-internal/inventory-internal.db.integration.test.ts`; IT-AS-B01 updated |
| `issueStockIds` lock + clock after lock (BE-LS-003) | UT-LS-B09 `memo-receive.test.ts` | IT-LS-B08 (Memo Receive + Load in parallel across the Bangkok New Year: 24 ids unique) |
| internal API + `InventoryServiceTokenGuard` (BE-LS-004/013) | UT-LS-B07 `guard.test.ts`, UT-LS-B08 `allocation.test.ts`, UT-LS-B11 `purchase-lines.test.ts` | IT-LS-B02, B03 (master part), B06, B19, photos, token boundary, NP-LS-01/02/05 |
| PURCHASE_IN_USE, Document Setup `external_used_at`, approval types narrowed (BE-LS-005) | UT-LS-B10 `document-setup.service.test.ts`, UT-AS-B07b, router test | IT-LS-B10, IT-LS-B11 |
| inventory scaffold, config, errors, master client, ported auth (BE-LS-006) | UT-LS-B05/B06 + config/errors `test/platform/platform.test.ts` | IT-LS-B15, body caps, health `http-photos-sse.db.integration.test.ts` |
| inventory migration + roles (BE-LS-007) | — | `test/platform/roles.db.integration.test.ts` (app role: stock_movement INSERT/SELECT only, no partner/auth; reader role), IT-LS-B18 |
| approval settings + Approve Center (BE-LS-008) | — | IT-LS-B14, IT-LS-B17 |
| Load to Stock module, stock component, saga, re-drive (BE-LS-009) | UT-LS-B01/B02/B03 `test/load-to-stock/domain.test.ts`, UT-LS-B04 (saga) | IT-LS-B03/B04/B05/B06/B07/B09/B11/B12/B19/B20 `load-to-stock.db.integration.test.ts` |
| notifications + SSE + retention (BE-LS-010) | hub / summary / cursor in `platform.test.ts` | IT-LS-B04 (rows + recipients), IT-LS-B16, NP-LS-07 |
| photos (BE-LS-011) | signature, limiter in `domain.test.ts` | IT-LS-B13, NP-LS-06 |

### N+1 evidence (query events counted, BEGIN/COMMIT excluded; 1 vs many parents, same budget asserted)

| Endpoint | Measured (1 → many) | Budget | Test |
|---|---|---|---|
| master `purchase-lines/loadable/search` (1 → 50 lines) | 2 → 2 statements | 2 | NP-LS-01 |
| master `purchase-lines/batch` (1 → 200) | 1 → 1 | 1 | NP-LS-02 |
| master `PUT load-allocations` (1 → 200 lines, 200 Stock IDs) | 9 → 9; release of 200 = 6 | ≤ 9 | NP-LS-05 |
| inventory `GET /load-to-stock/:id` (1 → 200 rows) | 4 → 4 + 1 master call (`batch`) | ≤ 4 + 1 | NP-LS-02 |
| inventory list / Daybook, Approve Center pending (1 → 50) | 1 → 1 | 2 | NP-LS-03 |
| inventory create ON (1 → 200 rows) | 6 → 6 + 3 master calls (batch, resolve, numbering; company currency from a 60 s copy of `reference`) | ≤ 8 + 3 | NP-LS-04 |
| inventory apply OFF create (1 → 200 rows): tx0 + PUT + tx1 | 14 → 14 (tx0 8, tx1 6) + 1 PUT | tx0 ≤ 6 + tx1 ≤ 8 = 14 total; tx0 has 2 more (advisory number lock + max) and tx1 2 fewer than the plan — total within budget | NP-LS-05 |
| photos/from-purchase-line (2 new → 2 reused) | ≤ 3 → 1, master content streams 2 → 0 | ≤ 3 + 1 per new file | NP-LS-06 |
| notifications list for-me (1 → 20) | 1 → 1 | 1 | NP-LS-07 |

IT-LS-B12 (dev workstation, Windows host, PostgreSQL in Docker): OFF Save of 200 rows end to end **698 ms**, test-process RSS delta 17 MiB. Not a production measurement: idle RSS of the built image and `free -m` on the 4 GB host remain for infra/devops.

### Backend implementation notes (deviations, all inside the approved flow)

1. `stock.load_row_id` is nullable: a row removed from an applied load is deleted from the document while its REVERSED stock keeps its Stock ID and `load_id`. A reversed stock has `pcs = weight = 0` (the CHECK `pcs = on_hand + Σ buckets` would otherwise forbid `on_hand = 0`); the full quantity history is in `stock_movement` (`LOAD_REVERSAL`).
2. `master_sync_op` adds `kind` and stores the desired document of an edit in `payload` (CHECK ≤ 384 KiB instead of 64 KiB) so a refused re-apply leaves document and stock unchanged; `CONFIRMED` is never persisted separately (tx1 moves PREPARED → DONE).
3. Master `purchase-lines/batch` items add `vendorCode` / `vendorName` (the PU vendor snapshots) for the load header snapshot (additive internal field).
4. The inventory migration does not `CREATE SCHEMA`: the roles script creates schema `inventory` owned by `gms_inventory_migrator`, which has no CREATE on the database.
5. Purchase `usedBy` answers the label `"Load to Stock"` (master does not know the load's number).
6. `@hono/node-server` is 2.1.7 (not 1.x) — see INV-20261117-001; `hono` 4.13.18.
7. CSRF follows the contract text: a trusted `Origin`, or no Origin with `Sec-Fetch-Site: same-origin`; cross-site Fetch-Metadata is always refused; master's `x-gms-csrf` marker is not required (sending it is harmless).
8. A DRAFT saved while approval is OFF is applied on that save (ADR-0050 `saveStatus`), op kind `APPLY_DRAFT`.
9. The sweep's "skip when the pool has < 2 idle connections" is not implemented (Prisma's adapter pool exposes no idle count); the sweep is single-flight and bounded to 20 ops/min instead.

Security reviews (`sec-auditor`, `security-auditor`) on this source revision: not run by backend — routed once by the parent.

### Corrective pass 1 — INV-20261117-002 / -003 F1, F2 (owner 2026-11-17 "แก้ F1 F2")

| Finding | Change | Test | Result |
|---|---|---|---|
| F1 photo upload buffered the multipart body before the limiter | `app.ts` takes the `writes` slot (3/process) before `formData()`; `PhotoService.uploadHeld` sniffs 8 bytes and streams the file into storage (no second full copy); 429 `RATE_LIMITED` + `Retry-After: 2` when full; slot released on every path | `http-photos-sse.db.integration.test.ts` "INV-20261117-003 F1" (3 held → 429; 0 in flight after 201, after 415 and after 8 parallel uploads) | pass |
| F2 apply did not re-assert "not in use" | `service.ts` `lockUnused` in tx1 for UPDATE / DELETE; `saga.ts` `SyncHold` → tx1 rolls back, op `STUCK` (`in_use`), load stays SYNCING, caller 409 `LOAD_TO_STOCK_IN_USE`; consumer rule SA-LS-18 in decisions.md | `load-to-stock.db.integration.test.ts` "INV-20261117-003 F2" (stock used between tx0 and tx1 → 409, stock untouched, op STUCK, delete BUSY; release + `sync:redrive` → DONE, stock 6, PU loaded 6) | pass |

Commands (fresh disposable DB, provisioned roles): inventory `vitest run` **45 passed** (5 files); `tsc --noEmit` and ESLint `src` + `test` clean. No master/auth code changed in this pass.

### Dev fix 2026-11-17: photo read crashed the service

Live browser test: after a photo upload + read, the inventory process exited with undici `ERR_INVALID_STATE: ReadableStream is already closed` (the `GET /load-to-stock/photos/{id}` body was a Node `Readable` handed to `Response` as an async iterable; a cancelled image read closed it twice), so every `/api/inventory/*` call answered 502 (Account list and number preview empty). Fix: `Readable.toWeb(file.stream)` in `src/app.ts`. IT-LS-B13 now also cancels a photo read after the first chunk and checks a full read returns the uploaded bytes. Inventory suite 45/45, tsc and ESLint clean; dev container restarted healthy.

Follow-up (same day): the crash recurred after the photo fix, after a normal Approve/Revise flow with no photo cancel. The `undici` frames point at the service's own outbound `fetch` (auth license check, JWKS), not at the photo response. Cause: `AbortSignal.timeout(…)` kept running after a call completed, and 401/403/500 license bodies were never read; when the timer aborted a finished call, undici closed the already-closed body stream and the process exited. Fix: an `AbortController` timer cleared in `finally`, and unread bodies are cancelled (`discardBody`) in `license-client.ts` and `jwks.ts`. New UT: an unread 401/403/500 body is cancelled and the timer never aborts a finished call. Inventory suite 46/46, tsc and ESLint clean. The dev container (Node 24.11, older bundled undici) is more exposed than the production image (Node 24.22.3); if the crash recurs, capture the request log lines right before it.
