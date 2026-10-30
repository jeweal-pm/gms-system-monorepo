# 2026-10-29 Memo Receive frontend (FE-MR-007…010)

- Feature `memo-receive` UI rev 3 / SA rev 1 / ADR-0034, approved by the owner 2026-10-29 ("อนุมัติ memo-receive revision 3").
- `frontend/src/features/memo-receive`: real `memoReceive.*` API (options, nextNumber, create, update with kept line ids, delete, approve, list, get); the browser mock store, its numbering and the "Preview" note are removed, and the old `gms.memo-receive.v1` key is deleted on load. Server Stock IDs (`YY####`) replace "Auto" after save. Approve button with confirm dialog; an Approved document is read-only. Photos show "come in a later update".
- Shared Quotation components: `DocumentKind.location` switch (Location column/field hidden for Memo Receive only) and `QuotationHeader` `extraActions` / `hideEditDelete`; Quotation, Memo Out and Memo Out Return behaviour unchanged.
- Evidence: [testing.md](../apps/backend/master/memo-receive/testing.md#frontend-verification-2026-10-29-fe-mr-007010); TODO [memo-receive.md](../task/todo/memo-receive.md).

## Revision 4: line photos (FE-MR-011)

- Feature `memo-receive` TODO rev 4 / SA rev 2 / ui-spec rev 4, approved by the owner 2026-10-29 ("อนุมัติ memo-receive revision 4").
- Row-panel photos work as on Quotation: Add files or drag and drop, up to 5 JPEG/PNG per item (5 MB each), first photo is the main photo, remove; uploads go to `POST /api/v1/memo-receive/photos` and photos load from `GET /api/v1/memo-receive/photos/{id}`. Saves send each row's `photoIds` in order. The "later update" note is gone for Memo Receive (Memo Out keeps it). The left item card shows the selected row's main photo; photos are read-only once Approved. A duplicated document keeps its row photos, as on Quotation.
- `features/quotation/api.ts`: the photo upload code is shared as `uploadLinePhoto(route, file)`; Quotation's upload is unchanged.
- Evidence: [testing.md](../apps/backend/master/memo-receive/testing.md#frontend-verification-ui-spec-revision-4-2026-10-29-fe-mr-011).
