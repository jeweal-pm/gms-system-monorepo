# Sequence diagram: reserve (SA revision 1, approved 2026-11-02)

Main user flow: [diagram/reserve-flow.md](../../../../diagram/reserve-flow.md). Requests go browser → same-origin nginx `/api/master/trpc` → `backend-api-master` (tRPC, authz per procedure) → PostgreSQL schema `partner`. Save and Approve are the [Memo Out revision 2 sequences](../memo-out/sequence-diagram.md) with `reserve` in place of `memo_out`.

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Reserve page
  participant API as backend-api-master
  participant DB as PostgreSQL partner
  U->>FE: From Stock → pick, key Pcs/Weight ≤ Pending, Sale Price; or key a row by hand
  FE->>API: memoStock.list (reserve VIEW)
  U->>FE: Save
  FE->>API: reserve.create / update (ADD / EDIT + CSRF)
  API->>DB: BEGIN; stock lines: SELECT memo_stock (exists, ≤ pending); number (Document Setup lock); write reserve + lines; COMMIT
  API-->>FE: {id, docNo, version} — PENDING_APPROVAL (nothing held)
  U->>FE: Approve (confirm)
  FE->>API: reserve.approve {id, expectedVersion} (reserve APPROVE + CSRF)
  API->>DB: BEGIN; UPDATE reserve SET APPROVED WHERE id, version, PENDING_APPROVAL
  alt 0 rows
    API-->>FE: 404 / 409 STATUS_INVALID / 409 CHANGED
  else updated
    API->>DB: SELECT memo_stock … ORDER BY id FOR UPDATE (shared with Memo Out approvals)
    alt a line > pending
      API->>DB: ROLLBACK
      API-->>FE: 409 RESERVE_PENDING_SHORT
    else enough
      API->>DB: UPDATE memo_stock SET pending -= q, reserved += q; COMMIT
      API-->>FE: {status: APPROVED, stockLineCount}
    end
  end
```
