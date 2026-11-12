# ADR-0048: Line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase

- Status: Accepted
- Date: 2026-11-11
- Feature / source UI revision: `line-photos` / owner request 2026-11-11 (no new design; the existing row-panel photo grid)
- SA revision: 1
- Deciders: owner
- Approval evidence: owner in chat 2026-11-11, "อนุมัติ". Owner answers 2026-11-11 (AskUserQuestion): "Own uploads, like PO (Recommended)"; "SA design first, then wait".
- Supersedes / related ADRs: extends [ADR-0041](0041-purchase-order-document.md) decision 5 (Purchase Order photos) and the Quotation / Memo Receive photo design (SA-QT-10, SA-MR-15) to five more documents. Related: [ADR-0042](0042-purchase-document-and-stock-deduction.md) (Purchase), [ADR-0045](0045-transaction-document-soft-delete.md) (soft delete).

## Context

Owner request (2026-11-11, verbatim): "อันไหนที่เขียน Photos for this document come in a later update. ให้เพิ่มรูปได้แล้ว".

Facts from the code (verified 2026-11-11):

- Only Quotation, Memo Receive and Purchase Order store line photos: tables `quotation_line_photo`, `memo_receive_line_photo`, `purchase_order_line_photo` (`line_id`, `position`, `file_id` → `stored_files`), routes `/api/v1/{quotation,memo-receive,purchase-order}/photos` (POST upload, GET by id) behind `main.ts` access checks and the shared photo limiter, and an nginx location each in `docker/nginx/gms-dev.conf`.
- Reserve, Memo Return, Memo Out, Memo Out Return and Purchase accept `photoIds` on every line but cap it at **0** (`memo-schemas.ts` `memoLineSchema` `photoIds: z.array(uuid).max(0)`, `purchase.schemas.ts` the same). Their frontend form (`trade-document/document-form.tsx`) passes `NO_PHOTOS` (`upload: null`), so the row panel says "Photos for this document come in a later update."
- Memo Return, Memo Out Return and Purchase already have a `lineHook` (Stock IDs / stock checks); Reserve and Memo Out use the customer-stock adapter's hook.
- The owner chose **own uploads per document, like PO** (not the stock item's Memo Receive photos).

## Decision

1. **Storage.** Five tables in schema `partner`, each shaped exactly like `purchase_order_line_photo`: `reserve_line_photo`, `memo_return_line_photo`, `memo_out_line_photo`, `memo_out_return_line_photo`, `purchase_line_photo` — `line_id uuid` (FK → its line, ON DELETE CASCADE), `position smallint` (1…5), `file_id uuid` (FK → `stored_files`, ON DELETE RESTRICT), PK (`line_id`, `position`), index on `file_id`. One additive migration; no existing row changes.
2. **Routes.** `POST /api/v1/{reserve,memo-return,memo-out,memo-out-return,purchase}/photos` (upload) and `GET …/photos/:id` (read), each a thin controller over the existing `uploadPhoto` / `streamPhoto` and `createPhotoStore(<module>)`, exactly as `purchase-order-photo.public.controller.ts`. Access in `main.ts` with `createPhotoAccessCheck(masterTrpc, <menu leaf>, sharedPhotoLimiters)`: POST needs ADD or EDIT on that document + CSRF, GET needs VIEW. JPEG/PNG only, ≤ 5 MB, signature-checked (unchanged code).
3. **Ownership of a photo.** `stored_files.source_type` = `reserve.line-photo`, `memo_return.line-photo`, `memo_out.line-photo`, `memo_out_return.line-photo`, `purchase.line-photo`. On save every `photoIds` entry must be a ready file of **that** document's source; otherwise `<CODE>_PHOTO_INVALID` (422, path `lines.N.photoIds.M`), as `PURCHASE_ORDER_PHOTO_INVALID`. A photo uploaded for one document type can't be linked to another.
4. **Contract.** Line `photoIds`: `max(0)` → `max(5)`, unique, order = display order (first = main photo). Detail output lines gain `photoIds` (ordered). Lists are unchanged. The save writes each line's photos after the lines in the same transaction (`afterLines`), composed with the document's existing `lineHook` (Memo Return / Memo Out Return Stock IDs, Purchase stock checks, customer-stock adapter) — the existing hook runs first, unchanged.
5. **Editability.** Photos change only through a save, so they follow each document's existing editable statuses; an Approved document's photos are read-only. Duplicating a whole document keeps its photo ids (same source, as PO); duplicating a row starts with no photos (as today).
6. **Stock photos are not copied** (owner choice). A line picked from stock starts with no photos.
7. **Soft delete / restore** (ADR-0045): unchanged; photo links stay with the soft-deleted lines, so a restore brings them back. Files are never deleted by a document action (RESTRICT), as for the existing three documents.
8. **nginx.** Five `location ^~ /api/v1/<doc>/photos` blocks, copied from the Purchase Order one (upload ≤ 5 MB, same timeouts). This is a shared config file: infra owns it and the parent serializes the edit.
9. **Frontend.** `document-form.tsx` takes a per-document photo target (`upload` + `url`) from its config instead of `NO_PHOTOS`; each of the five api modules gets `upload…Photo` / `…PhotoUrl` like Purchase Order. The row panel's grid, rules (≤ 5, drag to reorder, first = Default) and animations are reused unchanged.

## Alternatives

- **Show the stock item's Memo Receive photos (read-only or as a starting set).** Rejected by the owner (2026-11-11) for now; it stays possible later as an additive read of `memo_receive_line_photo` through `memo_stock.memo_receive_line_id`.
- **One shared `document_line_photo` table with a document-type column.** Fewer tables, but no real FK to each line table (polymorphic), and it would break the pattern the three existing documents use. Rejected.

## Consequences and capacity

- Host budget (4 GB RAM / 2 vCPU): no new service, worker or cache. Photo traffic shares the existing limiter (3 concurrent uploads, 6 downloads across all documents), so peak memory and DB pool use are unchanged; uploads stay buffered ≤ 5 MB each.
- Disk: grows only with uploaded photos (≤ 5 per line, ≤ 5 MB each), in the existing photo storage. No change to backups other than size.
- DB: 5 small link tables; a save adds one bounded `createMany` (≤ 200 lines × 5) and one bounded validation query (≤ 1,000 ids) per document.
- Security: same controls as the existing photo routes (live authorization per request, CSRF on POST, content signature check, size limit before buffering, no listing endpoint, ids are UUIDs).
- Uploaded-but-never-saved files stay as unreferenced `stored_files` rows, as today for Quotation / Memo Receive / PO (no cleanup job in scope).

## Acceptance and approval

- Owner approves this ADR revision → backend (migration, schemas, hooks, controllers, `main.ts`, tests) and infra (nginx locations) → frontend (photo targets, tests) → both security reviews on the final diff.
- Backend tasks BE-LP-001…006, infra INF-LP-001, frontend FE-LP-001…003 in [task/todo/line-photos.md](../task/todo/line-photos.md).
