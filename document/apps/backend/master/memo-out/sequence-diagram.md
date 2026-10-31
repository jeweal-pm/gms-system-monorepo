# Sequence diagram: memo-out (SA revision 2, approved 2026-10-31)

Main user flow: [diagram/memo-out-flow.md](../../../../diagram/memo-out-flow.md). Requests go browser → same-origin nginx `/api/master/trpc` → `backend-api-master` (tRPC, authz per procedure) → PostgreSQL schema `partner`.

## Save (create / update): reserves nothing

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Memo Out page
  participant API as backend-api-master
  participant DB as PostgreSQL partner
  U->>FE: From Stock → pick items, key Pcs/Weight ≤ Pending, type Sale Price
  FE->>API: memoStock.list {q?, from?, to?, cursor?} (memo-out VIEW)
  API->>DB: SELECT memo_stock WHERE pending > 0 (memo_stock_pending_all_idx, ≤ 51 rows)
  U->>FE: Save
  FE->>API: memoOut.create / update (ADD / EDIT + CSRF)
  API->>DB: BEGIN; (update) status check; prepare: SELECT memo_stock WHERE id IN stock lines
  alt item missing / duplicate / qty > pending / no Sale Price
    API-->>FE: 422 REFERENCE_INVALID / 400 VALIDATION_ERROR (line field)
  else ok
    API->>DB: number (Document Setup lock), write memo_out + lines (stock fields copied, pending snapshot); COMMIT
    API-->>FE: {id, docNo, version} — status PENDING_APPROVAL
  end
```

## Approve: cuts Memo Stock into Reserve

```mermaid
sequenceDiagram
  actor U as Approver
  participant FE as Memo Out page
  participant API as backend-api-master
  participant DB as PostgreSQL partner
  U->>FE: Approve (confirm)
  FE->>API: memoOut.approve {id, expectedVersion} (memo-out APPROVE + CSRF)
  API->>DB: BEGIN; UPDATE memo_out SET APPROVED … WHERE id AND version AND status = PENDING_APPROVAL
  alt 0 rows
    API->>DB: SELECT status, version → ROLLBACK
    API-->>FE: 404 NOT_FOUND / 409 STATUS_INVALID / 409 CHANGED
  else updated
    API->>DB: SELECT … FROM memo_stock WHERE id IN stock lines ORDER BY id FOR UPDATE
    alt a line > current pending (another document took it)
      API->>DB: ROLLBACK
      API-->>FE: 409 MEMO_OUT_PENDING_SHORT (lines.N.pcs / weightCt)
    else enough
      API->>DB: UPDATE memo_stock SET pending -= q, reserved += q, version + 1 FROM (VALUES …); COMMIT
      API-->>FE: {id, version, status: APPROVED, stockLineCount}
    end
  end
```
