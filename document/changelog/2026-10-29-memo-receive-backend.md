# 2026-10-29 Memo Receive backend (BE-MR-001…006)

- Feature `memo-receive` UI rev 3 / SA rev 1 / ADR-0034, approved by the owner 2026-10-29 ("อนุมัติ memo-receive revision 3").
- `backend-api-master`: migration `20261029090000_memo_receive` (memo_receive, memo_receive_line, memo_receive_charge, memo_stock, memo_stock_id_counter); `MemoReceiveService` (PENDING_APPROVAL → APPROVED, Stock ID `YY####` per year of the save, approval into Memo Stock with location `Memo`), `MemoStockService.list`; tRPC `memoReceive.*`, `memoStock.list`; `MasterMenu` + `memo-receive`, `memo-return`; `currency.options` readable with `memo-receive:VIEW`.
- Trade-document engine: per-document create/editable statuses, line hook, line column omit; Memo Out / Memo Out Return behaviour unchanged. Vendor adapter and vendor options shared with Memo Out Return.
- Evidence: [testing.md](../apps/backend/master/memo-receive/testing.md#backend-verification-2026-10-29-be-mr-001006); TODO [memo-receive.md](../task/todo/memo-receive.md).

## BE-MR-007 line photos (SA revision 2 / ui-spec rev 4, approved 2026-10-29 "อนุมัติ memo-receive revision 4")

- Migration `20261029150000_memo_receive_line_photo` (additive): `partner.memo_receive_line_photo` (PK line_id+position, position CHECK 1..5, line CASCADE, stored file RESTRICT, index on file_id).
- REST `POST /api/v1/memo-receive/photos` (memo-receive ADD or EDIT + CSRF, raw JPEG/PNG ≤ 5 MB, magic bytes) → `201 {photoId}`; `GET /api/v1/memo-receive/photos/:id` (VIEW, streamed, immutable cache). Storage module `memo-receive-photo`, `stored_files` source `memo_receive.line-photo`, kept permanently.
- Quotation photo storage/HTTP/controller code generalized (`createPhotoStore`, `createPhotoAccessCheck`, `uploadPhoto`/`streamPhoto`); Quotation behaviour and tests unchanged. Both routes share one process-wide limiter pair (`sharedPhotoLimiters`, 3 uploads / 6 downloads).
- `memoReceive.create/update`: ≤ 5 distinct photo ids per line, each a ready Memo Receive photo, else 422 `MEMO_RECEIVE_PHOTO_INVALID` (`lines.N.photoIds.M`); links replaced in the save transaction; `get` returns `photoIds` in order. Memo Out / Memo Out Return still refuse photos; Memo Stock unchanged.
- Evidence: [testing.md](../apps/backend/master/memo-receive/testing.md#backend-verification-sa-revision-2-2026-10-29-be-mr-007).
