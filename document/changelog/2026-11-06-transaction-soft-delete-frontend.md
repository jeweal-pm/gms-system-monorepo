# 2026-11-06 Transaction soft delete (frontend)

- Feature `transaction-soft-delete`, revision 1 (owner approval 2026-11-06 in chat, "อนุมัติ เริ่มทำเลย"; OQ-1 Quotation deletable only before approval; OQ-3 after Delete return to Create New), [ADR-0044](../adr/0044-transaction-document-soft-delete.md) Accepted. TODO: [transaction-soft-delete](../task/todo/transaction-soft-delete.md) FE-SD-001…003 (FE-SD-004 open for the parent). Contract: [backend handoff](../coordination/handoffs/transaction-soft-delete-backend.md), reused unchanged.
- Pages: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order and Purchase.
- What users see:
  - Each Daybook has an **Active / Deleted** toggle. The choice is kept for the page in its tab (React state, no storage). Switching views starts again from page one. The lists load 50 at a time with **Load more**. Deleted rows have a grey dot and the label "Deleted". The empty text in the Deleted view is "No deleted {plural}.". A failed list load now names the list ("Couldn't load memo returns. Try again."), not one document.
  - A deleted document opens read-only with the banner "Deleted by {user} on dd/mm/yyyy HH:mm". The banner is a focusable status. Every input, the row editor, the pickers, Save, Approve, Edit and Delete are off or hidden. The API returns only the user id, so the banner shows the signed-in user's own name and "another user" for anyone else.
  - **Restore**, shown only to users with DELETE, asks "Restore {No.}? It goes back to {Draft / Pending Approval} and can be edited again." The document then reloads editable and is back in the Active list.
  - After a confirmed Delete the page returns to Create New, as before. The Delete confirm text is unchanged (`deleteDocumentConfirm`). Purchase Order now uses the same confirm modal instead of `window.confirm`.
  - Quotation shows Delete only for DRAFT / PENDING_APPROVAL. It is hidden for APPROVED / REJECTED / CANCELLED, which covers every quotation created today. Edit is unchanged.
  - `<CODE>_DELETED` on save, approve or delete shows "This {noun} was deleted. Restore it to edit." and reloads the document read-only. On Restore, `<CODE>_STATUS_INVALID` shows "This {noun} is no longer deleted." and reloads; `CHANGED` keeps its existing message and reloads.
- Code (`frontend/src/features`):
  - `trade-document/document-api.tsx`:
    - error mappers: the shared `<CODE>_DELETED` case, `mapDocumentRestoreError`, `daybookLoadError`;
    - deleted view: `deletedInfo`, `DeletedBanner` / `DocumentDeletedBanner`, `useDeletedByName`;
    - daybook: `daybookInput` / `daybookQueryOptions` / `daybookState`, `DaybookViewProvider` / `useDaybookView`, `DaybookViewToggle`, and `DocumentDaybook` (toggle, deleted dot, Load more, optional dot and empty text);
    - a short-lived notice handover, so a message survives the remount after a refetch.
  - `trade-document/document-form.tsx`, `customer-stock-config.tsx`: read-only deleted mode, banner, Restore, `restore` in `DocumentApi`, `mapRestoreError` in the config.
  - `quotation/api.ts`, `components/QuotationForm.tsx`, `QuotationPage.tsx`, `rail/RightRail.tsx`, `header/QuotationHeader.tsx` (`hideDelete`), `use-confirm.tsx` (`restoreDocumentConfirm`).
  - `memo-receive/{api.ts, components/MemoReceiveForm.tsx, MemoReceivePage.tsx}`, `purchase-order/{api.ts, components/PurchaseOrderForm.tsx, PurchaseOrderPage.tsx}`.
  - `{reserve, memo-out, memo-return, memo-out-return, purchase}/{api.ts, components/*Page.tsx}`: `restore` mutation, infinite daybook per view, `<prefix>RestoreError`, `deleted` passed to the form.
- Tests:
  - new `test/trade-document/soft-delete.test.ts` covers UT-SD-F01…F06 (36 tests);
  - `test/purchase/purchase-page.integration.test.ts` adds IT-SD-F01 (a deleted purchase rendered through the provider stack) and IT-SD-F02 (restore POST with CSRF, and the deleted daybook input through the real link);
  - `deletedAt` / `deletedBy` added to the detail fixtures (memo out, memo out return, memo return, reserve, quotation, memo receive, purchase order, purchase), and `mapRestoreError` added to the reserve and item-table test configs.
- Verification:
  - `tsc --noEmit` exit 0;
  - ESLint 0 errors (2 existing warnings in `auth/login-form.tsx`);
  - `vitest run` 76 files / 749 tests passed (before: 710);
  - frontend container restarted and `repair-dev-networks` OK; `http://127.0.0.1:8080/` and the 8 page routes return 200;
  - each `<doc>.list {deleted: true}` reaches the API (401 without a session);
  - not yet run: a signed-in smoke of each daybook and detail (no dev credentials here).
- Root cause of the dev "Couldn't load memo receives / this memo return" (parent finding 1): the infinite daybook sends `direction`, which the strict list schemas rejected (nginx: `memoReturn.list` 400; no `memoReturn.get` request was made). The parent fixed this in the backend. The detail text came from the daybook using the single-document load message.
- Not changed: `backend-api-auth/**`, manifests and the lockfile. No new dependency. Security reviews: routed by the parent.

## Owner change 2026-11-06: no Active / Deleted view

The owner asked that deleted documents show nowhere ("ถ้า delete แล้วไม่ต้องขึ้นในไหนเลย tab active deleted ไม่ต้องมี").

- The daybook toggle, its view state (`DaybookViewProvider`, `useDaybookView`), the grey Deleted dot and the "No deleted …" text are removed from all 8 pages.
- `daybookInput()` no longer sends `deleted`, so the backend default (active only) applies.
- The read-only banner remains only for a document that was deleted while open in another tab, or when the API returns `<CODE>_DELETED`.
- The backend `deleted` filter and `restore` are unchanged; the UI no longer uses them.
- Tests: UT-SD-F01/F02 and IT-SD-F02 were rewritten. Full suite: 749/749.
