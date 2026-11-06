# Handoff: transaction-soft-delete backend → frontend (BE-SD-002…005 done)

- Feature ID / revision: `transaction-soft-delete`, SA revision 1 (no UI spec revision; frontend behaviour in FE-SD-001…004 of the [TODO](../../task/todo/transaction-soft-delete.md)).
- Approval: owner 2026-11-06 in chat, "อนุมัติ เริ่มทำเลย" (OQ-1 Quotation deletable only before approval; OQ-2 Restore uses DELETE; OQ-3 after Delete return to Create New; OQ-4 no audit table; OQ-5 default). [ADR-0044](../../adr/0044-transaction-document-soft-delete.md) Accepted.
- From: backend (`senior-nestjs-developer`), `backend-api-master` only. To: parent (security reviews, integration) → frontend (`senior-react-developer`) for FE-SD-001…004.
- Source revision: HEAD `dc4c42d` + uncommitted `backend-api-master` working tree of 2026-11-06 (nothing committed). `backend-api-auth/**` untouched.
- Bundle (governs): [api-contract](../../apps/backend/master/transaction-soft-delete/api-contract.md), [decisions](../../apps/backend/master/transaction-soft-delete/decisions.md), [error-handling](../../apps/backend/master/transaction-soft-delete/error-handling.md), [authorization](../../apps/backend/master/transaction-soft-delete/authorization.md), [testing results](../../apps/backend/master/transaction-soft-delete/testing.md#results-2026-11-06-backend-be-sd-002005), [changelog](../../changelog/2026-11-06-transaction-soft-delete-backend.md).

## Verified contract for the frontend

Transport unchanged: tRPC over `/api/master/trpc/<doc>.<proc>`, plain JSON (no transformer). Queries need `<menu>` VIEW; mutations need the grant plus `x-gms-csrf: 1` and the trusted Origin.

| `<doc>` | `<menu>` | `<CODE>` | delete / restore input schema |
|---|---|---|---|
| `quotation` | `quotation` | `QUOTATION` | `versionedIdSchema` |
| `reserve` | `reserve` | `RESERVE` | `memoVersionedIdSchema` |
| `memoReceive` | `memo-receive` | `MEMO_RECEIVE` | `memoVersionedIdSchema` |
| `memoReturn` | `memo-return` | `MEMO_RETURN` | `memoVersionedIdSchema` |
| `memoOut` | `memo-out` | `MEMO_OUT` | `memoVersionedIdSchema` |
| `memoOutReturn` | `memo-out-return` | `MEMO_OUT_RETURN` | `memoVersionedIdSchema` |
| `purchaseOrder` | `purchase-order` | `PURCHASE_ORDER` | `memoVersionedIdSchema` |
| `purchase` | `purchase` | `PURCHASE` | `purchaseVersionedIdSchema` (with `withFieldErrors`) |

All three schemas are the same strict shape `{ id: uuid, expectedVersion: int ≥ 1 }`.

### Procedures

| Procedure | Kind / grant | Input | Output |
|---|---|---|---|
| `<doc>.list` | query, `<menu>` VIEW | existing input `& { deleted?: boolean }` (strict boolean, default `false`) | existing `{ items, nextCursor, total }`; each item `+ deletedAt: string \| null` (ISO; always `null` when `deleted` is false). `deleted: true` → only deleted documents, same order `(docDate desc, createdAt desc, id desc)`, cursor v1, `limit ≤ 50`, same q / party (`partyId`, quotation `customerId`) / status / from / to filters; `total` counts the selected view. Quotation keeps its default "not CANCELLED". **Reset the cursor when switching views.** |
| `<doc>.get` | query, `<menu>` VIEW | `{ id }` | existing detail `+ deletedAt: string \| null` (ISO) `+ deletedBy: string \| null` (user id, like `createdBy`). A deleted document is returned (not NOT_FOUND). `deletedAt !== null` = read-only. |
| `<doc>.delete` | mutation, `<menu>` DELETE + CSRF | `{ id, expectedVersion }` (unchanged) | `{ ok: true, version: number }` (`version` = new version, additive). Soft: status, lines, charges, photos, Stock IDs and stock unchanged; the Doc No. stays taken. Allowed: engine documents `PENDING_APPROVAL`; **Quotation `DRAFT` / `PENDING_APPROVAL` only** (APPROVED / REJECTED / CANCELLED → `QUOTATION_STATUS_INVALID`; every Quotation created today is APPROVED, so hide Delete for it). |
| `<doc>.restore` **new** | mutation, `<menu>` **DELETE** + CSRF | `{ id, expectedVersion }` | `{ id: string, version: number, status: <DocStatus> }` (status unchanged, e.g. `PENDING_APPROVAL`, Quotation `DRAFT` / `PENDING_APPROVAL`). Content is not re-checked; the next Save / Approve does that. |
| `<doc>.update`, `<doc>.approve`, `quotation.submit / reject / cancel` | unchanged | unchanged | refuse a deleted document with `<CODE>_DELETED` (409); nothing is written. |
| `nextNumber`, `options`, pickers, `memoStock.list`, `memoOutstanding.*`, `memoOutReturn.outstanding`, `purchase.memoStock`, `purchase.purchaseOrderLines` | unchanged | unchanged | unchanged (deleted drafts never appear: they are never APPROVED). `nextNumber` after a delete previews the next number, not the deleted one. |

### Errors (tRPC error: `message` and `data.domainCode` = the code below; `data.code` = tRPC code)

| Code | HTTP / tRPC | When | Frontend action (FE-SD-003) |
|---|---|---|---|
| `<CODE>_DELETED` **new** | 409 `CONFLICT` | update / approve / delete / quotation submit / reject / cancel on a deleted document | "This {noun} was deleted. Restore it to edit." + refetch `get` (read-only view) |
| `<CODE>_STATUS_INVALID` | 409 `CONFLICT` | delete of a non-deletable status (unchanged); **restore of a document that is not deleted** | restore: "This {noun} is no longer deleted." + refetch |
| `<CODE>_CHANGED` | 409 `CONFLICT` | stale `expectedVersion` on delete / restore (unchanged) | existing "changed by someone else" + refetch |
| `<CODE>_NOT_FOUND` | 404 `NOT_FOUND` | unknown id | unchanged |
| `PERMISSION_DENIED` / `CSRF_INVALID` / `UNAUTHORIZED` | 403 / 401 | no `<menu>` DELETE on restore, missing CSRF, … | unchanged |
| `VALIDATION_ERROR` | 400 `BAD_REQUEST` | `deleted` not a boolean, bad restore input | purchase: `data.fieldErrors` e.g. `[{ path: "deleted", code: "invalid_type" }]`; other routers: `data.domainCode: "VALIDATION_ERROR"` without field errors (existing behaviour of those routers) |
| `PARTNER_UNAVAILABLE` | 503 | database unavailable | unchanged |

Miss order for a guarded write (D8): NOT_FOUND → DELETED → STATUS_INVALID → CHANGED. Restore: NOT_FOUND → STATUS_INVALID (not deleted) → CHANGED. Quotation keeps its existing order after DELETED (NOT_FOUND → DELETED → CHANGED → STATUS_INVALID). A retried delete after success gets `<CODE>_DELETED`; treat it as "already deleted" and reload.

Messages (`errorBody`): `"The <noun> was deleted"` for quotation, reserve, memo receive, memo return, memo out, memo out return, purchase order, purchase. The `QUOTATION_*`, `PURCHASE_ORDER_*` and `PURCHASE_*` codes now have their own messages instead of the generic text; codes are unchanged.

### Example shapes (live smoke, Purchase Order)

```json
// purchaseOrder.delete {"id":"01a1af16-…","expectedVersion":1}
{ "ok": true, "version": 2 }
// purchaseOrder.list {"deleted":true} → items[n]
{ "id": "01a1af16-…", "docNo": "3", "status": "PENDING_APPROVAL", "docDate": "2026-11-06", "dueDate": "2026-12-06", "vendorName": "…", "currency": "THB", "grandTotal": "50.00", "updatedAt": "2026-11-06T04:20:33.572Z", "deletedAt": "2026-11-06T04:20:33.572Z" }
// purchaseOrder.get → … "deletedAt": "2026-11-06T04:20:33.572Z", "deletedBy": "<user id>"
// purchaseOrder.restore {"id":"01a1af16-…","expectedVersion":2}
{ "id": "01a1af16-…", "version": 3, "status": "PENDING_APPROVAL" }
```

## Verification

| Check | Result |
|---|---|
| `npx prisma generate`, `npx tsc --noEmit`, `npx eslint src "test/**/*.ts"` | ok, exit 0, exit 0 |
| `npx vitest run` (default) | 45 files passed / 13 skipped; 527 tests passed / 80 skipped (DB-gated) |
| Disposable PostgreSQL (`127.0.0.1:55440`, tmpfs, removed) full suite | 57 files passed / 1 skipped; 590 tests passed / 17 skipped; twice (second on a fresh container) |
| New tests | `soft-delete.test.ts` 47 tests (UT-SD-01…07 × 7 documents, 10…12); `soft-delete.db.integration.test.ts` 7 tests (IT-SD-01…10); quotation UT-SD-08/09 (3 new + B19 rewritten); router GP-SD-01 (8 routers) |
| Migration | fresh DB: 29 applied; dev: "Applying migration `20261106090000_transaction_soft_delete`", healthy, `repair-dev-networks` OK; `migrate diff`: no soft-delete drift |
| Live smoke through nginx | create → delete `{ok, version 2}` → hidden from list → `deleted: true` lists it → `get` with `deletedAt/By` → update / approve / delete `PURCHASE_ORDER_DELETED` → restore without CSRF 403, stale 409 CHANGED → restore `{version 3, PENDING_APPROVAL}` → restore again 409 STATUS_INVALID → editable (update v4). Quotation delete of APPROVED → `QUOTATION_STATUS_INVALID`. `list {deleted: true}` 200 on the other 7 documents. |

## Notes for the parent

- Files changed (all `backend-api-master/`): `prisma/schema.prisma`; new `prisma/migrations/20261106090000_transaction_soft_delete/migration.sql`; `src/common/errors.ts`; `src/master/router.ts`; `src/trade-document/{document-engine,document-errors,customer-stock-document,memo-out.service,reserve.service,memo-receive.service,memo-return.service,memo-out-return.service}.ts`; `src/purchase-order/purchase-order.service.ts`; `src/purchase/purchase.service.ts`; `src/quotation/{quotation.service,quotation.errors,quotation.schemas}.ts`; tests: new `test/trade-document/soft-delete.test.ts`, `test/trade-document/soft-delete.db.integration.test.ts`; updated `test/master/router.test.ts`, `test/quotation/quotation.service.test.ts`, `test/trade-document/memo-documents.test.ts` and the DB tests of memo-out, memo-receive, memo-return, reserve, quotation-from-stock, purchase-order, purchase.
- No parent-serialized file was touched: no manifest, lockfile, `app.module.ts`, `trpc-handler.ts`, Docker, nginx or `tech-stack.md`. No dependency added. The generated Prisma client was regenerated locally (`prisma generate`).
- Implementation detail vs. the testing plan wording: delete and restore use Prisma `updateManyAndReturn` (one guarded `UPDATE … RETURNING`, PostgreSQL) instead of `updateMany`, so the `.deleted` / `.restored` logs get `docNo` without an extra read. Same single statement and guard as D4/D6.
- Security reviews: not run by backend. Route this final source revision once to `sec-auditor` and `security-auditor` and record both in `testing.md`.
- Open: M-SD-01 (deleted share and list p95 one month after release). Dev data: smoke Purchase Order `3` left deleted.
