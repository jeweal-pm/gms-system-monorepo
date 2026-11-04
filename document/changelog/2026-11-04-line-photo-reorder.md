# 2026-11-04 Row-panel photos: drag to reorder, first photo is the main photo

- Owner request 2026-11-04 (screenshot of the row panel "Photos 0 / 5"): on every transaction, photos can be dragged and dropped; dropping one on the first slot makes it the default (main) photo with the crown.
- Code: `frontend/src/features/quotation/components/items/LinePhotosField.tsx` (shared by Quotation, Memo Receive, Purchase Order, Purchase and every other page using the row panel).
  - Photo tiles are draggable while the document is editable (`PHOTO_DRAG_TYPE` marks an in-row move, so files from the computer still upload as before). Dropping on a tile or an empty slot moves the photo there (`movePhoto`); slot 0 is the main photo. The target tile is outlined while dragging. Read-only documents can't reorder. The crown button "Set as main photo" stays as the keyboard path.
  - Dropping a photo back on its own slot changes nothing (the form is not marked dirty).
  - No backend change: lines already send photo ids in order and the services store them by `position` (main = position 1).
- Verification: `test/quotation/line-photos-reorder.test.ts` (UT-PH-01…05); frontend `vitest run` 73 files / 700 tests passed (includes the uncommitted Purchase work), `tsc` 0, ESLint 0 errors (2 old warnings). Frontend container restarted; the served chunk contains the new code. Browser drag not exercised by a test runner (manual check).
- Security review 2026-11-04 (HEAD `cdc8c3f` + working tree; LinePhotosField.tsx fa841cee): sec-auditor clear, security-auditor clear; no ticket. A dropped id only reorders photos already on the row; file drops keep the `canAdd` + upload validation; read-only rows cannot reorder.
