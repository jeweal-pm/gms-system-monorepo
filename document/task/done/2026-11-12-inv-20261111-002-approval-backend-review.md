# Done: INV-20261111-002 approval backend review fixes (pass 1)

- Ticket: [INV-20261111-002](../investigation/INV-20261111-002-approval-backend-review.md) revision 1, owner approval 2026-11-12 ("ต่อเลย").
- Owner / date: backend, 2026-11-12. Corrective pass 1 of 3; result: resolved.
- Branch: `feat/10-11-26-approval-api` (uncommitted working tree; not committed or pushed).

## Scope delivered

| Item | Decision | Change |
|---|---|---|
| F1 | fix | `lockSourceHeaders` (FOR SHARE, id order, live re-check) in Memo Out Return and Purchase Save (engine `lockSources`) and `apply`; lock order documented in approval-setup architecture item 5 |
| Item 1 | fix | `approvalSetting.update` refuses unavailable types: `VALIDATION_ERROR` `type` / `not_available` |
| Item 2 | fix | party cursor row must be live PENDING_APPROVAL of the type → else `VALIDATION_ERROR cursor`; subquery scoped |
| H2 | fix | go-live dry run: one rolled-back 4 s transaction per document; predictions against pre-run state (documented) |
| H1 | accept | ADR-0046 item 7, approve-center D5 / authorization wording corrected |

## Changed files

- `backend-api-master/src/trade-document/source-lock.ts` (new), `document-engine.ts`, `memo-out-return.service.ts`
- `backend-api-master/src/purchase/purchase-stock.ts`, `purchase.service.ts`
- `backend-api-master/src/approval-setting/approval-setting.service.ts`, `backend-api-master/src/approval/approval.service.ts`
- `backend-api-master/src/scripts/approve-pending.ts`
- Tests: `test/approval-setting/approval-source-lock.db.integration.test.ts` (new), `test/trade-document/source-lock.test.ts` (new), `test/approval-setting/approval-setting.service.test.ts`, `test/approval/approval.service.test.ts`, `test/approval/approval.db.integration.test.ts`, `test/purchase/purchase-stock.test.ts`, `test/scripts/approve-pending.test.ts`, `test/scripts/approve-pending.db.integration.test.ts`
- Docs: `document/adr/0046-…md`, `document/apps/backend/master/approve-center/{decisions,authorization}.md`, `document/apps/backend/master/approval-setup/{architecture,testing}.md`, changelog `2026-11-10-approval-backend.md`

## Verification

- F1 two-session reproduction (IT-AS-B15): fails on the pre-fix code and with only `FOR SHARE` removed (MOR committed alongside the Memo Out delete; approved Purchase on a deleted PO); passes after the fix, 5/5 repeats.
- Disposable PostgreSQL 18.6 (removed afterwards): master 694 passed / 15 skipped; auth 107 passed / 6 skipped; `tsc --noEmit` and eslint clean.
- `f1-system-api-master-1` restarted, healthy; volumes untouched.
- Security re-review: not re-sent (parent decides).

## Remaining risk

- Dry-run predictions ignore stock taken earlier in the same run (accepted, documented).
- A deadlock window that existed before this fix is unchanged: a source edit (line replacement) that overlaps a dependent can still be aborted by the deadlock detector, with no data change.
