# Sequence diagrams: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

Notation: `{doc}`, `{menu}`, `{t}` and `{CODE}` stand for the document router, menu key, header table and error prefix (written with braces because Mermaid strips angle brackets).

Editable Mermaid. Path: browser → Next same-origin proxy (`/api/master/trpc`) → nginx → `api-master:3201` → master tRPC context (CSRF for mutations, JWT, `auth.current_authorization` via the 1-connection reader, license check) → procedure grant → domain service → PostgreSQL `partner`. Status model: [approve-center-review-flow](../../../../diagram/approve-center-review-flow.md). UI flow: [approve-center-flow](../../../../diagram/approve-center-flow.md).

## 1. Open Approve Center: counts and first page

```mermaid
sequenceDiagram
  autonumber
  actor U as Approver
  participant FE as Approve Center (Next)
  participant PX as same-origin proxy / nginx
  participant CTX as master tRPC context
  participant AV as auth.current_authorization (reader, pool 1)
  participant AP as ApprovalService
  participant DB as PostgreSQL partner

  U->>FE: open /approve/{menu}
  FE->>PX: approval.summary (query)
  PX->>CTX: forward cookies
  CTX->>AV: SELECT … permissions, user_name WHERE user_id, session_id
  AV-->>CTX: grants, displayName
  CTX->>CTX: license check (existing)
  CTX->>AP: summary(permitted types = APPROVE ∧ VIEW)
  AP->>DB: one UNION ALL of capped counts (pending_idx, LIMIT 100 each)
  DB-->>AP: [{type, count}]
  AP-->>FE: {items, countCap: 100}
  FE->>FE: panel badges, sidebar total = Σ counts (99+)
  FE->>PX: approval.pending {type, sort: submittedAt, dir: asc, limit: 50}
  PX->>CTX: forward
  CTX->>CTX: require {menu}:APPROVE and {menu}:VIEW
  alt missing grant
    CTX-->>FE: 403 PERMISSION_DENIED
  else permitted
    CTX->>AP: pending(input)
    AP->>DB: one SELECT … LIMIT 51 (READ_TX 2.5 s) + lateral stone names for returned rows
    DB-->>AP: ≤ 51 rows
    AP-->>FE: {items ≤ 50, nextCursor}
  end
  alt DB unavailable
    AP-->>FE: 503 PARTNER_UNAVAILABLE (summary: no badge, list: error + Retry)
  end
```

## 2. Approve one row (existing procedure, version from the row)

```mermaid
sequenceDiagram
  autonumber
  actor U as Approver
  participant FE as Approve Center
  participant CTX as master context
  participant DS as {Doc}Service.approve (existing)
  participant DB as PostgreSQL partner

  U->>FE: Approve → Confirm
  FE->>CTX: {doc}.approve {id, expectedVersion: row.version} (+CSRF)
  CTX->>CTX: CSRF → JWT → auth view → license → {menu}:APPROVE
  CTX->>DS: approve(actorId, id, version)
  DS->>DB: BEGIN, UPDATE … SET status=APPROVED WHERE id, version, status=PENDING, deleted_at IS NULL
  alt 0 rows
    DS->>DB: SELECT status, version, deleted_at
    DS-->>FE: 404 NOT_FOUND / 409 DELETED / STATUS_INVALID / CHANGED
  else updated
    DS->>DB: stock effect of that document (unchanged, row locks)
    alt stock short
      DS->>DB: ROLLBACK
      DS-->>FE: 409 {CODE}_PENDING_SHORT
    else
      DS->>DB: COMMIT
      DS-->>FE: {id, version, status: APPROVED}
    end
  end
  FE->>FE: invalidate approval.summary, approval.pending(type), {doc}.get/list
```

Bulk "Approve selected" repeats this one document at a time on the client and stops on Cancel (unchanged from phase 1, without the `get` before each approve).

## 3. Reject / Revise (new)

```mermaid
sequenceDiagram
  autonumber
  actor U as Approver
  participant FE as Approve Center / document page
  participant CTX as master context
  participant ENG as TradeDocumentEngine.review
  participant DB as PostgreSQL partner

  U->>FE: Reject… (reason) or Revise… (note), confirm
  FE->>CTX: {doc}.reject {id, expectedVersion, reason} | {doc}.requestRevision {id, expectedVersion, note} (+CSRF)
  CTX->>CTX: CSRF → JWT → auth view (displayName) → license → {menu}:APPROVE
  CTX->>CTX: zod: reason/note trim 1–500
  alt invalid
    CTX-->>FE: 400 VALIDATION_ERROR reason|note
  end
  CTX->>ENG: review(actor{id,name}, id, version, REJECT|REVISE, note)
  ENG->>DB: UPDATE {t} SET status=REJECTED|REVISION_REQUESTED, review_*, reviewed_by_name, version+1, updated_* WHERE id, version, status=PENDING, deleted_at IS NULL
  alt 0 rows
    ENG->>DB: SELECT status, version, deleted_at
    ENG-->>FE: NOT_FOUND / DELETED / STATUS_INVALID / CHANGED
  else 1 row
    Note over ENG,DB: no stock table, counter or line is touched
    ENG-->>FE: {id, version, status}
  end
  FE->>FE: row leaves, counts refetch, toast
```

## 4. Creator edits and resubmits (new)

```mermaid
sequenceDiagram
  autonumber
  actor C as Creator (EDIT)
  participant FE as Document page
  participant CTX as master context
  participant ENG as TradeDocumentEngine
  participant DB as PostgreSQL partner

  C->>FE: open document (status REVISION_REQUESTED, banner with note)
  FE->>CTX: {doc}.update {id, expectedVersion, …} (+CSRF, EDIT)
  CTX->>ENG: update (editable = PENDING, REVISION_REQUESTED)
  ENG->>DB: existing save transaction (+ header totals), status unchanged
  ENG-->>FE: {id, version}
  C->>FE: Resubmit
  FE->>CTX: {doc}.resubmit {id, expectedVersion} (+CSRF, EDIT)
  CTX->>ENG: resubmit(actor{id,name}, id, version)
  ENG->>DB: UPDATE SET status=PENDING_APPROVAL, submitted_at/by/by_name, version+1 WHERE id, version, status=REVISION_REQUESTED, deleted_at IS NULL
  alt 0 rows
    ENG-->>FE: NOT_FOUND / DELETED / STATUS_INVALID / CHANGED
  else
    ENG-->>FE: {id, version, status: PENDING_APPROVAL, submittedAt}
  end
  Note over FE: back in Approve (end of the oldest-first queue), lastReview shown
```
