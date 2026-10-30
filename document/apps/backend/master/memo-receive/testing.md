# Testing: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

These follow `document/workflow/automated-testing.md`. Backend tests use the existing memo-out test style (service with a test DB, router with fake context).

| ID | Level | Check |
|---|---|---|
| IT-MR-01 | integration | create → PENDING_APPROVAL, docNo from Document Setup (row and plain), stockIds `YY0001…` in line order, totals = calculator |
| IT-MR-02 | integration | Stock ID counter per year of the save, with the clock faked to 2026 and 2027: gives `26…` and `27…` whatever the Doc Date is. Concurrent creates (2 parallel) give no duplicates. At 9,999 → `STOCK_ID_EXHAUSTED` and nothing is saved |
| IT-MR-03 | integration | update keeps the Stock IDs of lines sent with `id`, gives new numbers to new lines, does not reuse numbers of removed lines. A foreign line id → `VALIDATION_ERROR lines.N.id` |
| IT-MR-04 | integration | stale version → CHANGED. Update or delete of an APPROVED document → STATUS_INVALID |
| IT-MR-05 | integration | approve → APPROVED, approved_at/by set, version + 1, one `memo_stock` per line with location `Memo` and pending = received. A second approve → STATUS_INVALID with no new rows. Two parallel approves → one succeeds |
| IT-MR-06 | integration | `memoStock.list`: only that vendor, only pending > 0, q and date filters, keyset paging with no gaps or repeats, netUnitPrice = line amount ÷ basis (with and without line discount). Amount = line amount × pending ÷ received (CTS and PCS), equal to the line amount when fully pending |
| IT-MR-07 | integration | discount bounds: line % > 100, line amount > gross and document amount > subtotal all → VALIDATION_ERROR. Totals are never negative |
| IT-MR-08 | integration | Document Setup `used` is true once a memo receive references the row. Memo Out and Memo Out Return still create as DRAFT (engine regression) |
| UT-MR-R1 | unit (router) | every procedure checks its grant and CSRF. `memoStock.list` is allowed with either memo-return or memo-receive VIEW. `currency.options` is allowed with memo-receive VIEW |
| UT-MR-F1 | unit (frontend) | api.ts maps input and output, removes the old `localStorage` key, and maps each error code to its message |
| UT-MR-F2 | unit (frontend) | no Location column or field. Stock ID shows "Auto" and then the number. Approve is visible only for PENDING_APPROVAL with APPROVE. After approval the page is read-only |

Acceptance (manual): save, edit, approve one document; check the Memo Stock rows via `memoStock.list`; the approved document cannot be edited or deleted.

## Backend verification (2026-10-29, BE-MR-001…006)

| Case | File | Result |
|---|---|---|
| IT-MR-01…08 | `backend-api-master/test/trade-document/memo-receive.db.integration.test.ts` | 9/9 passed (incl. guard IT-MR-00) on disposable PostgreSQL 18.6 `127.0.0.1:55440`, no project volume, all migrations applied by `prisma migrate deploy`; container removed after the run. Opt-in: `PARTNER_TEST_DATABASE_URL`; skipped in the default suite |
| UT-MR-S1/S2, IT-MR-07 (schema), UT-MR-ID1, UT-MR-P1…P3 | `test/trade-document/memo-receive.test.ts` | 7/7 passed |
| UT-MR-R1 | `test/master/router.test.ts` | passed (file 9/9) |
| IT-MR-08 (unit part) | `test/document-setup/document-setup.service.test.ts` UT-DS-B09 | passed |
| Engine regression | `test/trade-document/memo-documents.test.ts` | 10/10 passed (the delete re-read mock now carries `status`) |

- Migration `20261029090000_memo_receive`: deploy → rollback (drop the 5 tables) → re-deploy verified; 18 CHECKs present; `prisma migrate diff` shows no drift for the new tables. `memoStock.list` EXPLAIN: index scan on `memo_stock_pending_idx`, no sort.
- `pnpm typecheck` pass, `pnpm lint` pass, `pnpm test` 36 files passed / 2 skipped, 405 tests passed / 27 skipped (DB-gated), `NODE_OPTIONS=--max-old-space-size=1024`.
- Local dev DB: `prisma migrate deploy` applied `20261028090000_memo_out` (was pending) and `20261029090000_memo_receive`; status up to date.
- Security review (sec-auditor + security-auditor): pending; the parent routes it once after frontend on the same source revision.

## Frontend verification (2026-10-29, FE-MR-007…010)

| Target | Test case IDs | Result |
|---|---|---|
| `frontend/src/features/memo-receive/api.ts` (`toMemoReceiveInput`, `fromMemoReceive`, `savedLineIds`, `stoneChoices`, `mapMemoReceiveError`, `memoReceiveLoadError`, `memoReceiveAccess`, `removeLegacyStore`) | UT-MR-F1 (6 cases) | pass |
| `MemoReceiveForm.tsx` (`canApproveMemo`, `approveMessage`, status labels, hrefs), `QuotationHeader` `extraActions` / `hideEditDelete`, `ItemTable` `itemColumns` + `DocumentKind.location` | UT-MR-F2 (4 cases), UT-MR-05/06 kept (3 cases) | pass |
| Quotation / Memo Out / Memo Out Return regressions (shared components) | existing quotation, memo-out, memo-out-return suites | pass |

- `frontend`: `npx vitest run` 44 files / 455 tests passed; `test/memo-receive/memo-receive.test.ts` 13 passed; `npx tsc --noEmit` 0 errors; `npx eslint .` 0 errors (2 pre-existing warnings in `features/auth/login-form.tsx`, none in changed files).
- Live dev stack (2026-10-29): the api-master dev container was serving a build older than `memoOut`/`memoReceive` (watch did not see the bind-mount edits); a plain `docker restart f1-system-api-master-1` (no volume change, `migrate deploy`: no pending migrations) loaded it. As `superadmin@demo.com` through Nginx `localhost:8080`: `options` (2 vendors, 6 currencies, numbering configured, stone lists without codes), `currency.options`, `nextNumber` → `MR-1`; `create` → `260001`, `260002`; `update` with kept line ids reordered + 1 new line → `260002`, `260003`, `260001` (ids kept); stale `approve` → `MEMO_RECEIVE_CHANGED`; `approve` → APPROVED, `memoStockCount` 3; repeat approve and edit after approval → `MEMO_RECEIVE_STATUS_INVALID`; `list` shows APPROVED. Request bodies used the same shape as `toMemoReceiveInput` (no `stoneCodeId`, `location`; `photoIds: []`). `/memo/memo-receive/[id]` compiled and returned 200 on the Next dev server. Test data left in the local dev DB: `MR-1` (APPROVED), Stock IDs 260001–260003, 3 Memo Stock rows.
- Not done: an interactive browser check of the page (no browser automation available in this session).

## SA revision 2 cases (line photos)

| ID | Level | Check |
|---|---|---|
| IT-MR-09 | integration (PostgreSQL + `@gms/storage` local driver in a temp root) | upload PNG/JPEG with ADD or EDIT → ready `stored_files` row (kind `memo-receive-photo`, source `memo_receive.line-photo`, key `memo-receive-photo/…`); VIEW-only / no CSRF / wrong magic bytes refused; GET streams the same bytes with immutable caching; Quotation VIEW denied; unknown and Quotation photo ids → `MEMO_RECEIVE_NOT_FOUND`; a Quotation or unknown photo id on save → 422 `MEMO_RECEIVE_PHOTO_INVALID` at `lines.N.photoIds.M`, nothing saved; create and update keep the photo order per line (kept line ids keep Stock IDs); invalid update rolls back; APPROVED → `STATUS_INVALID`, links kept; a linked stored file can't be deleted (RESTRICT) |
| UT-MR-PH1…PH4 | unit (controller) | grants (ADD/EDIT + CSRF upload, VIEW read, Quotation grants refused), body validation, kind/source/module, headers, NOT_FOUND / VALIDATION_ERROR |
| UT-MR-PH5 | unit (access check) | Quotation and Memo Receive routes share one 3-upload / 6-download limiter pair; full → 503 `PARTNER_UNAVAILABLE` + `retry-after: 1`; slots released on finish; grants checked per menu before a slot |
| UT-MR-S3 | unit (schema) | ≤ 5 distinct uuid photo ids per line in order; 6 or duplicates refused |
| UT-MR-R1 (updated) | unit (router) | photo ids accepted up to 5; duplicates and 6 ids → BAD_REQUEST |
| UT-MR-F3 | unit (frontend) | upload target = `/api/v1/memo-receive/photos` (raw bytes, `x-gms-csrf`), client type/size checks, 401/403/413/415/422/503/network → messages; `photoIds` sent in order on save and loaded back as Memo Receive photo links; `MEMO_RECEIVE_PHOTO_INVALID` on save → item row; row panel add/remove/main photo, read-only when Approved, no "later update" note; item card shows the main photo |

## Backend verification, SA revision 2 (2026-10-29, BE-MR-007)

| Target | Test case IDs | Result |
|---|---|---|
| Migration `20261029150000_memo_receive_line_photo`, `MemoReceiveService` photo check/links, engine `lineInclude`/`afterLines` | IT-MR-09 | pass (`memo-receive.db.integration.test.ts` 10/10 incl. IT-MR-00…08) on disposable `postgres:18.6-alpine` at `127.0.0.1:55440`, tmpfs data, no project volume, `prisma migrate deploy` of all migrations; container removed |
| `memo-receive-photo.public.controller.ts`, shared `uploadPhoto`/`streamPhoto`, `createPhotoAccessCheck`, `sharedPhotoLimiters`, `createPhotoStore` | UT-MR-PH1…PH5 | 5/5 pass (`test/trade-document/memo-receive-photo.test.ts`) |
| `memo-schemas.ts` photo rule | UT-MR-S3, UT-MR-R1 | pass |
| Quotation photo regression (code moved to shared helpers) | UT-QT-B21…B30 unchanged | pass |

- `npm run typecheck` pass, `npm run lint` pass; `vitest run` with `PARTNER_TEST_DATABASE_URL`: 38 files passed / 1 skipped, 421 tests passed / 18 skipped; default suite 37 / 2 files, 411 passed / 28 skipped (DB-gated).
- Local dev DB: `prisma migrate deploy` applied `20261029150000_memo_receive_line_photo` (table present, migration finished). `docker restart f1-system-api-master-1` → healthy; Nest mapped `POST /api/v1/memo-receive/photos`, `GET /api/v1/memo-receive/photos/:id`. Direct check inside the container (`127.0.0.1:3201`, not through Nginx): unauthenticated POST/GET → 401 `UNAUTHENTICATED`, PUT → 405 `METHOD_NOT_ALLOWED`; Quotation photo route unchanged (401). An authenticated upload through `:8080` waits for INF-MR-001.
- Limiter-full code: `PARTNER_UNAVAILABLE` (503, `retry-after: 1`), the code Quotation returns. api-contract "SA revision 2" names it `PHOTO_BUSY` while also saying "the same code Quotation returns"; the implementation follows the same-code rule (no new code). SA to align the contract text.
- Security review: pending; the parent routes it once after the frontend (FE-MR-012).

## Frontend verification, ui-spec revision 4 (2026-10-29, FE-MR-011)

| Target | Test case IDs | Result |
|---|---|---|
| `features/quotation/api.ts` `uploadLinePhoto(route, file)` (shared; `uploadQuotationPhoto` now calls it with the quotation route, same checks and messages) | UT-MR-F3 (upload target, errors), UT-QT-05/06 unchanged | pass |
| `features/memo-receive/api.ts` `MEMO_RECEIVE_PHOTO_ROUTE`, `memoReceivePhotoUrl`, `uploadMemoReceivePhoto`, `toMemoReceiveInput` (`photoIds`), `fromMemoReceive` (photo links), `mapMemoReceiveError` (`MEMO_RECEIVE_PHOTO_INVALID`) | UT-MR-F3 (photo ids on save, 3 cases), UT-MR-F1 updated (photo ids sent) | pass |
| `features/memo-receive/defaults.ts` `MEMO_RECEIVE_KIND.uploadPhoto`; `MemoReceiveForm.tsx` `MEMO_RECEIVE_PHOTOS` row-panel target (replaces the "later update" no-target value); document Duplicate keeps row photos as Quotation does | UT-MR-F3 (upload target) | pass |
| Shared `LinePhotosField` / `ItemPhotoBox` with the Memo Receive kind: add/remove/main photo, read-only (Approved), item card main photo; Memo Out (no target) still shows the "later update" note | UT-MR-F3 (row panel, 4 cases) | pass |

- `frontend`: `npx vitest run` 45 files / 465 tests passed (`memo-receive-photos.test.ts` 10 new); `npx tsc --noEmit` 0 errors; `npx eslint .` 0 errors (2 pre-existing warnings in `features/auth/login-form.tsx`).
- Live check through Nginx `localhost:8080` as `superadmin@demo.com` (script, not a browser): upload without session → 401; 1×1 PNG upload → 201 `{photoId}`; non-image bytes → 422 `MEMO_RECEIVE_PHOTO_INVALID` at `(body)`; `memoReceive.create` with that `photoIds` → PENDING_APPROVAL, `get` returns the same `photoIds`; `update` with an unknown photo id → 422 `MEMO_RECEIVE_PHOTO_INVALID`; `GET /api/v1/memo-receive/photos/{id}` → 200 `image/png`, `cache-control: private, max-age=31536000, immutable`, same bytes; unknown photo → 404; the test document was deleted (`get` → 404). No approved document was created. The uploaded photo file stays in storage (uploads are kept permanently). `/memo/memo-receive` → 200 from the Next dev server.
- Not done: an interactive browser check of drag and drop and the lightbox (no browser automation in this session).
- Security review: pending; the parent routes it once (FE-MR-012).
