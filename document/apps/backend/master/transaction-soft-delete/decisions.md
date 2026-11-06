# Decisions: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

- feature-id: `transaction-soft-delete`; SA revision 1; source: owner request 2026-11-06 (no UI spec revision; the frontend behaviour is in the [central TODO](../../../../task/todo/transaction-soft-delete.md)).
- status: **approved** 2026-11-06 by the owner: owner answer in chat 2026-11-06, "อนุมัติ เริ่มทำเลย" (with OQ-1: Quotation deletable only before approval; OQ-3: after Delete return to Create New; OQ-2/4/5: defaults kept). Recorded in place in revision 1 (no new revision).
- ADR: [ADR-0044](../../../../adr/0044-transaction-document-soft-delete.md) (Accepted 2026-11-06).
- Bundle: [api-contract](api-contract.md), [architecture](architecture.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md), [main flow](../../../../diagram/transaction-soft-delete-flow.md).

## Owner request and decisions (2026-11-06)

> "อยากทำ soft delete Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale"

1. Only draft documents can be deleted, as today. Delete no longer removes rows and moves no stock.
2. Deleted documents are hidden from the normal list, and the list gets a "Deleted" filter to view them. A deleted document opens read-only, and "Restore" brings it back as a draft.
3. No reason is asked on delete; who and when are recorded.

## Scope

| Document | Table | Service | "Draft" (deletable) status today | In scope now |
|---|---|---|---|---|
| Quotation | `partner.quotation` | `QuotationService` | today DRAFT, PENDING_APPROVAL, APPROVED, REJECTED; **from this feature DRAFT, PENDING_APPROVAL only** (OQ-1); created APPROVED | yes, see D2 |
| Reserve | `partner.reserve` | `CustomerStockDocument` (engine) | PENDING_APPROVAL | yes |
| Memo Receive | `partner.memo_receive` | `MemoReceiveService` (engine) | PENDING_APPROVAL | yes |
| Memo Return | `partner.memo_return` | `MemoReturnService` (engine) | PENDING_APPROVAL | yes |
| Memo Out | `partner.memo_out` | `CustomerStockDocument` (engine) | PENDING_APPROVAL | yes |
| Memo Out Return | `partner.memo_out_return` | `MemoOutReturnService` (engine) | PENDING_APPROVAL | yes |
| Purchase Order | `partner.purchase_order` | `PurchaseOrderService` (engine) | PENDING_APPROVAL | yes |
| Purchase | `partner.purchase` | `PurchaseService` (engine) | PENDING_APPROVAL | yes |
| Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale | none yet | none yet | — | convention only (D16) |

## SA defaults (owner may change)

| ID | Default | Why |
|---|---|---|
| D1 | "Draft" means each document's existing editable status before approval. For the seven engine documents that is `PENDING_APPROVAL` (the amber "Pending approval" dot). Approved documents still cannot be deleted. | The owner said "same as today"; no status values change. |
| D2 | **Owner OQ-1 (2026-11-06): Quotation can be deleted only before approval.** The deletable set is its pre-approval statuses, `DRAFT` and `PENDING_APPROVAL`. APPROVED, REJECTED and CANCELLED cannot be deleted. A Quotation created APPROVED (every `quotation.create` today) can therefore never be deleted, though it can still be Cancelled. | Owner decision; replaces the 2026-10-27 "any non-cancelled" rule. |
| D3 | Columns `deleted_at TIMESTAMP(3) NULL` and `deleted_by VARCHAR(64) NULL` go on each header table only. The CHECK `<table>_deleted_check` keeps them both null, or both set **and** in a deletable status. No reason column. | Same types as `approved_at/approved_by`. The CHECK backs the "approved can't be deleted" rule in the database. |
| D4 | Delete = guarded `UPDATE` with `WHERE id, version = expected, status IN deletable, deleted_at IS NULL`. It sets `deleted_at = now`, `deleted_by = actor`, `version + 1`, `updated_at/by`. The status is unchanged. It returns `{ok: true, version}`. | One statement, the same optimistic check as today, and an open stale tab then gets a clear error. |
| D5 | A deleted document keeps its Doc No., and the number is never reused (`max + 1` still sees the row). Document Setup counts the numbering row as used. | The number stays unique and restore needs no renumbering. This replaces Q-QT-03 ("the next save may reuse the latest number") for deleted documents. |
| D6 | Restore = guarded `UPDATE` with `WHERE id, version = expected, deleted_at IS NOT NULL`. It clears both columns and sets `version + 1`, `updated_at/by = restorer`. The status is unchanged, so the document is editable again. Restore does not re-check content. The next Save/Approve re-checks as today: a stored inactive party or currency may stay, and stock availability is checked under lock at Approve. | Restore must not fail because master data changed while the document was deleted. |
| D7 | Restore needs the menu's `DELETE` grant plus CSRF. The Deleted list and opening a deleted document need `VIEW`. The auth action catalog does not change. | Whoever can delete can undo it, and `backend-api-auth` stays untouched. Owner OQ-2: default kept. |
| D8 | A deleted document is read-only. Update, approve, delete and the quotation submit/reject/cancel calls refuse it with `<CODE>_DELETED` (409). The miss-explanation order is NOT_FOUND → DELETED → STATUS_INVALID → CHANGED. Restoring a document that is not deleted gives `<CODE>_STATUS_INVALID`, and a stale version gives `<CODE>_CHANGED`. | Gives a distinct message ("This document was deleted") instead of a generic conflict. |
| D9 | `list` gets `deleted?: boolean` (default `false`). `false` = `deleted_at IS NULL`, so today's list is otherwise unchanged. `true` = deleted documents only, with the same order, keyset cursor, q/party/date/status filters and limit ≤ 50. Quotation's default "not CANCELLED" filter stays (deleted quotations are never CANCELLED). The list item adds `deletedAt` (null in the normal view), and `total` counts the selected view. | One list procedure; the cursor format (v 1) is unchanged. |
| D10 | `get` works on deleted documents. The detail adds `deletedAt: string \| null` and `deletedBy: string \| null` (user id, the same as `createdBy`). The frontend treats `deletedAt !== null` as the read-only flag. | One source of truth; no derived field to keep in step. |
| D11 | Pickers, reports, the outstanding views, Memo Stock sources and the PO lines in the Purchase picker need no query change. `purchase.memoStock`, `purchase.purchaseOrderLines`, `memoOutReturn.outstanding`, `memoStock.list`, `memoOutstanding.*` and the Purchase/Memo Out Return/Memo Return save checks read only `APPROVED` documents or `memo_stock` rows that approval wrote. A deleted document is never APPROVED (D3 CHECK). No other service reads `quotation`. Each approve guard still adds `deleted_at IS NULL` (defence in depth, D8). | Verified in the code on 2026-11-06 (architecture.md "Readers"). |
| D12 | Existing indexes stay. Each table gets one partial index `<table>_deleted_list_idx` on `(doc_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NOT NULL`. The normal list filters `deleted_at IS NULL` on the existing `*_list_idx` / `*_status_idx`. Make them partial only if M-SD-01 shows deleted rows above about 10 % of a table or a list p95 above 150 ms. | Only drafts are deleted, so the share should stay small. The 8 new indexes hold only deleted rows. Bounded for 4 GB / 2 vCPU. |
| D13 | Audit: the structured log event `<event>.deleted` (the existing name) gains `version` and `docNo`, and a new event `<event>.restored` logs `{actorId, id, docNo, version}`. The database keeps who/when of the **latest** delete in `deleted_*`; the restorer and time go to `updated_by/at`. No audit table. | No audit table exists today. Owner OQ-4: default kept, no audit table. |
| D14 | Lines, charges, photo link rows (`quotation_line_photo`, `memo_receive_line_photo`, `purchase_order_line_photo`) and `stored_files` are untouched on delete and restore. Photo download authorization is unchanged (VIEW). | ADR-0030 permanent retention. This adds no upload capability and no new `files/{module}/` scope. |
| D15 | There is no purge and no hard-delete endpoint; deleted documents are kept permanently. | Matches the restore requirement and ADR-0030. |
| D16 | Convention for documents not yet built (Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale): the same two columns, CHECK, partial index, `deleted` list filter, `restore` mutation, `<CODE>_DELETED` error, and readers that use only posted/approved rows or exclude `deleted_at IS NOT NULL`. A new document on the shared engine gets this automatically. | The owner listed them; each one's SA bundle cites ADR-0044. |
| D17 | Memo Receive Stock IDs and Purchase Stock IDs issued at save stay on the deleted draft's lines. The yearly counter never goes back, and restore keeps the same IDs. | Stock IDs stay unique; nothing is reissued. |
| D18 | Migration `20261106090000_transaction_soft_delete`: after the newest existing `20261104150000_purchase` and the ADR-0043 proposal `20261105090000_purchase_merged_line`. If a newer migration exists at implementation time, use the next timestamp. Existing migrations are not edited. | Prisma applies migrations in name order. |

## Open questions for the owner (answered 2026-11-06)

Answers: **OQ-1** only before approval (D2 changed); **OQ-2** default (DELETE); **OQ-3** after a confirmed Delete the page returns to Create New (a blank new document), as today, and a deleted document is opened read-only with Restore from the Deleted filter; **OQ-4** default (no audit table); **OQ-5** the answer was unclear, so the default stays: the Deleted filter is shown to VIEW users and Restore only to DELETE users.

Original questions:

| ID | Question | Default until answered |
|---|---|---|
| OQ-1 | Quotation is created Approved. Should it stay deletable in any status except Cancelled (today), or only before approval? Only before approval would make Quotations undeletable. | D2: today's rule |
| OQ-2 | Who can Restore: users with Delete (default) or users with Edit? | D7: Delete |
| OQ-3 | After Delete, should the page stay on the document (now read-only, with Restore) or go to a new blank document as today? | **Answered:** return to Create New, as today; deleted documents open read-only from the Deleted filter |
| OQ-4 | Is "latest delete by / at" enough, or do you need the full history of every delete and restore? Full history needs an audit table (a new SA revision). | D13: latest only + logs |
| OQ-5 | Should the "Deleted" filter be visible to every user who can view the page, or only to users with Delete? | Every VIEW user; the Restore button only with Delete |
