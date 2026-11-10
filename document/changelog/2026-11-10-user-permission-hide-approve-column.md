# 2026-11-10 User and Permission: APPROVE column hidden

- Owner request (2026-11-10): "frontend ใน user permssion เอา column approve ออก"; owner chose **"Hide column only"** after being told APPROVE controls who can approve documents.
- The matrix shows 8 action columns (VIEW, ADD, EDIT, DELETE, CANCEL, PRICE, PRINT, EXCEL). APPROVE stays in the permission catalog and is still enforced by the server (`<leaf>:APPROVE` on every approve call, Approve menu visibility, counts).
- Stored APPROVE grants are saved back unchanged: no visible column or Select All can toggle them. Turning a menu's VIEW off still clears all its other actions, APPROVE included (view-dependency VD-02).
- Consequence: APPROVE can no longer be granted or removed in the UI; a user without an existing grant cannot approve (Super Admin always can).
- The "{on} of {total} permissions on" counters (card and sticky summary) count the shown columns only.
- No backend change. Files: `frontend/src/features/user-permission/api.ts` (`MATRIX_ACTIONS`, `HIDDEN_MATRIX_ACTIONS`), `permission-utils.ts` (`matrixKeys`, `matrixApplicableCount`, `countEnabled`), `components/permission-matrix.tsx`, `components/permissions-card.tsx`, `user-permission-page.tsx`; test `frontend/test/user-permission/hidden-approve.test.ts` (UT-UP-H01…H03).
- Verification: `tsc --noEmit` exit 0; ESLint 0 errors on `src/features/user-permission`; `vitest run` 95 files / 883+ tests passed (user-permission 60); frontend restarted, `/setup/user-permission` 200. Not checked in a browser.

## Follow-up: Approve field in Personal Information (same day)

- Owner request: "ตรง Personal Information เรียง row เป็น Username, Password, Name Phone no. และ อีก row นึงจะเป็น Location พื้นที่เท่ากับ Username, Password, และ Approve พื้นที่เท่ากับ Name Phone no."; owner chose **"Pick documents to approve"** for the Approve field.
- Layout: 4 columns at ≥ 1280 px — row 1 Username, Password, Name, Phone No.; row 2 Location (2 columns) and Approve (2 columns). 2 columns at md (Location and Approve full width), 1 below.
- Approve is a multi-select (same control as Location) of the Approve menu's documents in sidebar order whose catalog leaf has APPROVE: today all 11 (Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split Stock, Transfer Location; verified against the live `permission.catalog` 2026-11-10).
- Choosing a document grants `<leaf>:APPROVE` and its VIEW (VD-01); removing it drops APPROVE only (VD-04). Documents the signed-in user may not grant (DA-02) keep their stored value. A Super Admin target shows every document, locked. Saved with the other permissions; no backend change.
- The catalog's other 29 leaves also carry APPROVE (settings, reports, …); those grants have no control now and are saved back unchanged.
- `MultiSelect` gained optional `loadErrorText` / `emptyText` (defaults keep the Location wording).
- Files: `frontend/src/features/user-permission/permission-utils.ts` (`approveOptions`, `approveSelection`, `withApproveSelection`), `components/personal-information-card.tsx`, `user-permission-page.tsx`, `frontend/src/components/ui/multi-select.tsx`; test UT-UP-H04 in `frontend/test/user-permission/hidden-approve.test.ts`.
- Verification: `tsc --noEmit` exit 0; ESLint 0 errors; `vitest run` 95 files / 887 tests passed; frontend restarted, `/setup/user-permission` 200. Not checked in a browser.
