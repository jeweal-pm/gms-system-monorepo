# Sequence diagrams: inventory / merge-split (SA revision 1, pending-review)

Main user flow: [diagram/merge-split-flow.md](../../../../diagram/merge-split-flow.md).

## Save with approval OFF (takes effect)

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as nginx
  participant I as backend-api-inventory
  participant M as api-master (internal)
  participant DB as inventory DB
  B->>N: POST /api/inventory/v1/merge-split {docDate, mode, sources, results}
  N->>I: forward
  I->>I: requireGrant ADD, CSRF, Zod, mode/conservation rules
  I->>M: master-data/resolve (stone codes, locations)
  I->>M: document-numbering/resolve {merge-split, docDate}
  I->>M: stock-ids/issue {merge-split, docId, applySeq 1, count}
  M-->>I: stockIds (idempotent)
  I->>DB: BEGIN; approval_setting FOR SHARE
  I->>DB: INSERT merge_split, sources, results, photos
  I->>DB: SELECT stock WHERE id = ANY(sources) ORDER BY id FOR UPDATE (+ load sync_state)
  alt not ACTIVE / on hand ≠ snapshot / load SYNCING
    I->>DB: ROLLBACK
    I-->>B: 409 MERGE_SPLIT_STOCK_CHANGED / MERGE_SPLIT_BUSY
  else ok
    I->>DB: UPDATE stock sources: on_hand −= take, consumed += take, version+1
    I->>DB: INSERT stock (results), stock_photo, stock_movement (*_OUT, *_IN)
    I->>DB: UPDATE results stock_uuid/stock_id/applied_version; sources take_cost; doc APPROVED auto, apply_seq 1
    I->>DB: COMMIT
    I-->>B: 201 {id, docNo, version, status APPROVED, stockIds}
  end
```

## Approval ON

`POST` stores a DRAFT (no master stock-id call, no lock). `submit`: read-only stale check + "source on another PENDING doc" check → PENDING_APPROVAL. `approve`: stock-ids/issue (applySeq = apply_seq + 1) before the transaction, then the same lock → check → update → insert block. Revise / reject change status only.

## Delete (or edit auto-approved) an effective document

```mermaid
sequenceDiagram
  participant I as backend-api-inventory
  participant DB as inventory DB
  I->>DB: BEGIN; lock merge_split (version)
  I->>DB: SELECT stock WHERE id = ANY(results ∪ sources) ORDER BY id FOR UPDATE
  alt any result not ACTIVE or version ≠ applied_version
    I->>DB: ROLLBACK
    Note over I: 409 MERGE_SPLIT_IN_USE {stockIds}
  else untouched
    I->>DB: results → REVERSED (on hand 0), *_REVERSAL rows
    I->>DB: sources on_hand += take, consumed −= take, *_REVERSAL rows
    I->>DB: delete: soft delete · edit: replace lines + apply with new stockIds (issued before BEGIN)
    I->>DB: COMMIT
  end
```

Concurrency: all stock locks are taken in one statement ordered by id, so two documents (or a Sale/Reserve) touching the same stocks serialize; the loser sees the moved on hand or version and gets 409.
