# ADR-0045: Soft delete for transaction documents

- Status: Accepted (2026-11-06)
- Date: 2026-11-06
- Renumbered 2026-11-06 from ADR-0044 at the merge with `change-to-nginx-with-new-skill-agent`, because ADR-0044 is the Purchase Outstanding report. The header comment of migration `20261106090000_transaction_soft_delete` still says ADR-0044 and is left unchanged to keep its applied checksum. That migration shares its timestamp with `20261106090000_purchase_merged_line` (ADR-0043). The two are independent (header columns vs `purchase_line`), and neither is renamed, because both have been applied.
- Feature / source UI revision: `transaction-soft-delete` / no UI spec revision (owner behaviour request 2026-11-06; frontend items in the central TODO)
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner answer in chat 2026-11-06, "อนุมัติ เริ่มทำเลย" (with OQ-1: Quotation deletable only before approval; OQ-3: after Delete return to Create New; OQ-2/4/5: defaults kept)
- Supersedes / related ADRs: changes the delete behaviour of [ADR-0032](0032-quotation-backend-in-master-service.md) (Q-QT-03 number reuse), [ADR-0033](0033-memo-documents-in-master-service.md), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md), [ADR-0036](0036-reserve-document.md), [ADR-0041](0041-purchase-order-document.md), [ADR-0042](0042-purchase-document-and-stock-deduction.md); keeps [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md) (photos kept) and [ADR-0016](0016-per-user-menu-action-permissions.md) (DELETE action reused)

## Context

On 2026-11-06 the owner asked for soft delete on Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment and Sale. The owner also decided: (1) only draft documents can be deleted, as today, and deleting changes no stock; (2) deleted documents are hidden from the normal list, a "Deleted" filter shows them, a deleted document opens read-only, and "Restore" brings it back as a draft; (3) no reason is asked; who and when are recorded.

Today, `TradeDocumentEngine.delete()` (`backend-api-master/src/trade-document/document-engine.ts`) and `QuotationService.delete()` hard-delete the header row with a guarded `deleteMany` (id, version, editable status). Lines, charges and photo link rows cascade. The `stored_files` rows stay. The editable "draft" status is `PENDING_APPROVAL` for the seven engine documents. Quotation is created `APPROVED` and can be deleted in any status except `CANCELLED` (owner 2026-10-27). Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment and Sale have no tables or pages yet.

Bundle: [decisions](../apps/backend/master/transaction-soft-delete/decisions.md), [api-contract](../apps/backend/master/transaction-soft-delete/api-contract.md), [database-diagram](../apps/backend/master/transaction-soft-delete/database-diagram.md), [sequence-diagram](../apps/backend/master/transaction-soft-delete/sequence-diagram.md), [main flow](../diagram/transaction-soft-delete-flow.md), [TODO](../task/todo/transaction-soft-delete.md).

## Decision

1. Each transaction document header gets `deleted_at TIMESTAMP(3) NULL` and `deleted_by VARCHAR(64) NULL`. A CHECK keeps them both set or both null, and allows a set pair only in a deletable status. Lines, charges, photo links and stored files are never touched by delete or restore.
2. **Delete** becomes a guarded `UPDATE` (id, expected version, deletable status, `deleted_at IS NULL`). Deletable means before approval only: `PENDING_APPROVAL` for the seven engine documents, and `DRAFT` or `PENDING_APPROVAL` for Quotation (owner OQ-1, 2026-11-06). Approved, Rejected and Cancelled quotations cannot be deleted, and neither can any Quotation created `APPROVED`; this narrows the 2026-10-27 rule. It sets `deleted_at`, `deleted_by`, `version + 1`, `updated_at`/`updated_by`. The status does not change and no stock moves. The document keeps its Doc No., and the number is never reused.
3. **Restore** is a new mutation per document: a guarded `UPDATE` (id, expected version, `deleted_at IS NOT NULL`) that clears both columns and sets `version + 1`, `updated_at`/`updated_by`. The document returns in the same status, editable again. Restore uses the menu's existing `DELETE` grant plus CSRF, so the auth catalog does not change.
4. A deleted document is read-only. Update, approve, submit, reject, cancel and delete refuse it with `<CODE>_DELETED` (409).
5. `list` gets `deleted?: boolean` (default `false`): `false` shows only `deleted_at IS NULL`, `true` shows only deleted documents, with the same keyset order and filters. `get` works on deleted documents and returns `deletedAt` / `deletedBy`.
6. Pickers, reports, the outstanding views, Memo Stock sources and the PO lines in the Purchase picker need no query change. They read only `APPROVED` documents, or Memo Stock rows that approval wrote, and the CHECK stops an approved document from being deleted. Approve guards add `deleted_at IS NULL` anyway.
7. One small partial index per table on `(doc_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NOT NULL` serves the Deleted view. Existing indexes stay as they are.
8. **Convention for future documents**: Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment and Sale adopt items 1–7 when they are built. That means the same columns, CHECK and partial index, delete/restore through the shared engine (or the same guarded statements), and any reader of another document must read only posted/approved rows or exclude `deleted_at IS NOT NULL`.

No package, service, container, network or storage change. [tech-stack.md](tech-stack.md) is unchanged.

## Alternatives

- **Keep hard delete** (current): rejected; the owner wants to view and restore deleted drafts.
- **A `DELETED` status value**: rejected. It would lose the status to restore to, and it would change every status enum, filter and status index.
- **Archive tables** (move rows on delete): rejected. They double the schema per document, add copy logic for lines, charges and photos, and make restore a multi-table move.
- **Make the existing list indexes partial (`WHERE deleted_at IS NULL`)**: deferred. Only drafts can be deleted, so deleted rows should stay a small share; rebuilding 16 indexes is not justified until measured (testing.md M-SD-01).

## Consequences and capacity

- Migration `20261106090000_transaction_soft_delete` (or the next timestamp after the newest migration present at implementation time): 16 nullable columns, 8 CHECKs, 8 partial indexes on 8 existing tables. Additive, no backfill, short locks on small tables. Rollback: drop the indexes, CHECKs and columns; deleted drafts then reappear as normal drafts (or hard-delete them first; that is a business decision).
- The Q-QT-03 rule ("the next save may reuse the latest number after a delete") ends. A deleted document keeps its number, so the number stays taken and is never issued again. Document Setup counts a numbering row used by a deleted document as used.
- Capacity on the 4 GB / 2 vCPU host: no new process, pool, cache or job. Each list keeps one bounded keyset query (≤ 51 rows) plus one count, with one extra predicate. The 8 partial indexes hold only deleted rows. Restore is one single-row statement. The PostgreSQL connection budget and api-master limits are unchanged.
- Deleted documents are kept permanently (no purge), and so are their photos (ADR-0030).
- No infra or devops routing: no container, image input, variable or workflow changes. api-master is rebuilt through the existing pipeline.

## Acceptance and approval

- Backend: UT-SD-01…12, IT-SD-01…10, GP-SD-01 in [testing](../apps/backend/master/transaction-soft-delete/testing.md). Frontend: UT-SD-F01…F06, TC-SD-01…06 in the [TODO](../task/todo/transaction-soft-delete.md).
- Covers SA revision 1: decisions (SA defaults D1…D18), api-contract, architecture, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing, the main flow diagram, the central TODO and this ADR. No packages.
- Accepted 2026-11-06 by the owner (evidence above). After a confirmed Delete the page returns to Create New, as today (OQ-3); deleted documents are opened read-only from the Deleted filter.
