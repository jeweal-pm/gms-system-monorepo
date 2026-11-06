# Architecture: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

## Service boundary

- Owning service: `backend-api-master` (domain `partner` schema), the existing routers. **No new service, module, container or package.** Auth (`backend-api-auth`) is unchanged: restore reuses the `DELETE` action (D7).
- Transport: unchanged (tRPC over HTTP through the same-origin proxy and nginx; [ADR-0025](../../../../adr/0025-gms-domain-routing-and-trpc.md)).

## Code changes (implementation guide for backend)

| Area | File | Change |
|---|---|---|
| Engine | `src/trade-document/document-engine.ts` | `DocDelegate` drops the need for `deleteMany`. **`list`**: `where.deletedAt = input.deleted ? { not: null } : null`; select and map `deletedAt`. **`get`**: `toDetail` adds `deletedAt`, `deletedBy`. **`update`**: select `deletedAt`; when it is set → `errors.deleted()` before the status check; the guarded `updateMany` adds `deletedAt: null`. **`delete`**: guarded `updateMany` (D4) and returns `{ok: true, version}`; the miss order is D8. **`restore(actorId, id, expectedVersion)`** new (D6). Logs `${event}.deleted` / `${event}.restored` with `docNo` and `version` (D13). The comment about number reuse (Q-QT-03) is updated to D5. |
| Errors | `src/trade-document/document-errors.ts` | add `deleted = () => partnerException(\`${code}_DELETED\`, 409)`. |
| Error messages | `src/common/errors.ts` | `<CODE>_DELETED` for all 8 codes. Also add any missing `PURCHASE_ORDER_*` / `PURCHASE_*` messages found while there (they currently fall back to the generic message). |
| List schemas | `documentListFields` (engine), `quotation.schemas.ts` list schema | `deleted: z.boolean().default(false)`. |
| Approve guards | `customer-stock-document.ts` (memo out, reserve), `memo-receive.service.ts`, `memo-return.service.ts`, `memo-out-return.service.ts`, `purchase-order.service.ts`, `purchase.service.ts` | Guarded `updateMany` adds `deletedAt: null`. On a miss, select `deletedAt` and throw `errors.deleted()` after NOT_FOUND. A shared helper `explainMiss(row, expectedVersion, editable)` in the engine file avoids eight copies. |
| Quotation | `src/quotation/quotation.service.ts`, `quotation.errors.ts` | A new `DELETABLE = ["DRAFT", "PENDING_APPROVAL"]` is used by delete (D2); `EDITABLE` stays for update. Otherwise the same as the engine for list/get/update/delete/restore; `transition()` (submit/approve/reject/cancel) adds `deletedAt: null`; `explainMiss` checks `deletedAt` first; `quotationDeleted()` error. |
| Router | `src/master/router.ts` | `restore` on each of the 8 routers: `permitted(<menu>, "DELETE", true).input(<same versioned schema as delete>)`. Purchase uses `withFieldErrors` like its other procedures. |
| Schema | `prisma/schema.prisma`, migration | [database-diagram](database-diagram.md). |

`src/app.module.ts`, `main.ts`, `trpc-handler.ts` and the manifests are not changed (no parent-serialized file is touched, apart from the generated Prisma client that `prisma generate` produces).

## Business rules

1. Deletable statuses (D1, D2): engine documents use their `editableStatuses` (unchanged); Quotation uses `DELETABLE` (DRAFT, PENDING_APPROVAL), which is narrower than before.
2. Delete and restore never change `status`, lines, charges, photos, `memo_stock`, `purchase_order_line.purchased_*` or any counter.
3. A deleted document refuses every write except `restore` (D8).
4. The number stays taken (D5); `nextRunningNo` is unchanged and still sees deleted rows.
5. Restore does not re-validate content (D6).

## Readers of transaction documents

Verified on 2026-11-06 in `backend-api-master/src`.

| Reader | Query | Deleted drafts excluded because |
|---|---|---|
| `purchase.purchaseOrderLines` (`purchase-pickers.ts`) | `d.status = 'APPROVED'` | approved can't be deleted (CHECK) |
| `purchase.memoStock`, `memoStock.list` | `memo_stock` rows | rows exist only after Memo Receive Approve |
| Purchase save/approve checks (`purchase-stock.ts`) | source `document.status === 'APPROVED'` | same |
| `memoOutReturn.outstanding` and Memo Out Return save | `o.status = 'APPROVED'` | same |
| `memoOutstanding.*` (vendor / customer) | `r.status` / `o.status = 'APPROVED'` | same |
| Memo Return save (`prepare`) | `memo_stock` rows | same |
| Quotation From Stock | `memo_stock` rows; nothing held | Quotation is read only by its own router |
| Document Setup `usedNumberingIds` | all rows by `numbering_id` | **intentionally includes deleted rows** (the number is used, D5) |

Any new reader of a document table must filter `status = 'APPROVED'` (or posted) or `deleted_at IS NULL` (D16).

## Transactions, timeouts and concurrency

- Delete and restore are a single guarded `UPDATE` outside an interactive transaction (as the delete is today). The miss explanation is one `SELECT`. Approve and update keep `WRITE_TX` (4 s).
- Races: delete vs. approve on the same version. Both guards include `version = expected`, so the first one wins and the other gets CHANGED, or DELETED/STATUS_INVALID in the miss explanation. Delete vs. restore follows the same version rule.

## Capacity (4 GB RAM / 2 vCPU host)

- There is no new process, pool, cache, worker or scheduled job. The connection budget is unchanged.
- List: one keyset `SELECT … LIMIT 51` plus one `COUNT`, the same as today. The deleted view uses a partial index with only deleted rows.
- Writes: delete and restore touch one row, and the partial index changes only on those two operations.
- Storage: 16 nullable columns (null costs a bitmap bit) and 8 small indexes.
- Measurement still needed: M-SD-01 (deleted share and list p95 after one month), [testing](testing.md).

## Infra / devops

No container, image input, network, volume, variable or workflow change, so this is not routed to infra or devops. The api-master image is rebuilt by the existing pipeline. [document/infra/service-index.md](../../../../infra/service-index.md) is unchanged.
