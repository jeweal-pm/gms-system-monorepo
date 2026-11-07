# Sequence diagram: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

Main user flow: [diagram/transaction-soft-delete-flow.md](../../../../diagram/transaction-soft-delete-flow.md) (not copied here). Decisions: [D4, D6, D8, D9](decisions.md). Every call goes UI → Next same-origin `/api/master/trpc` → nginx → `api-master`. The master auth context checks the JWT, current authorization and license, then the menu grant (and CSRF on mutations), before any domain code runs. `<doc>` / `<menu>` / `<CODE>` are as in the [api-contract](api-contract.md).

## Delete, Deleted filter, open read-only, Restore

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Document page (daybook rail)
  participant NX as Next proxy / nginx
  participant API as api-master (<doc> router)
  participant AZ as master auth context
  participant DB as PostgreSQL partner.<table>

  U->>FE: Delete (draft) → existing confirm text → OK
  FE->>NX: <doc>.delete {id, expectedVersion} + CSRF
  NX->>API: tRPC mutation
  API->>AZ: <menu>:DELETE + CSRF
  AZ-->>API: ok / PERMISSION_DENIED / UNAUTHORIZED
  API->>DB: UPDATE <table> SET deleted_at=now, deleted_by=actor, version+1, updated_at/by<br/>WHERE id AND version=expected AND status IN deletable AND deleted_at IS NULL
  alt 1 row
    API-->>FE: {ok: true, version}
    Note over API: log <event>.deleted {actorId, id, docNo, version}
    FE->>FE: invalidate <doc>.list (both views) + <doc>.get → Create New (blank document), as today (OQ-3)
  else 0 rows
    API->>DB: SELECT status, version, deleted_at WHERE id
    API-->>FE: 404 NOT_FOUND | 409 <CODE>_DELETED | 409 <CODE>_STATUS_INVALID | 409 <CODE>_CHANGED
  end

  U->>FE: Daybook filter "Deleted"
  FE->>API: <doc>.list {deleted: true, q?, from?, to?, cursor?, limit ≤ 50}
  API->>AZ: <menu>:VIEW
  API->>DB: SELECT … WHERE deleted_at IS NOT NULL [filters] ORDER BY doc_date DESC, created_at DESC, id DESC LIMIT 51<br/>(<table>_deleted_list_idx) + COUNT
  API-->>FE: items (deletedAt set), nextCursor, total

  U->>FE: Open a deleted document
  FE->>API: <doc>.get {id}
  API->>DB: SELECT header + lines + charges (+ photos)
  API-->>FE: detail with deletedAt / deletedBy → banner "Deleted by … on …", all inputs and actions off

  U->>FE: Restore (DELETE grant) → confirm
  FE->>API: <doc>.restore {id, expectedVersion} + CSRF
  API->>AZ: <menu>:DELETE + CSRF
  API->>DB: UPDATE <table> SET deleted_at=NULL, deleted_by=NULL, version+1, updated_at/by<br/>WHERE id AND version=expected AND deleted_at IS NOT NULL
  alt 1 row
    API-->>FE: {id, version, status}
    Note over API: log <event>.restored {actorId, id, docNo, version}
    FE->>FE: invalidate list + get → editable draft again
  else 0 rows
    API-->>FE: 404 NOT_FOUND | 409 <CODE>_STATUS_INVALID (not deleted) | 409 <CODE>_CHANGED
  end
```

## Writes on a deleted document (stale tab)

```mermaid
sequenceDiagram
  participant FE as Stale tab (document open before delete)
  participant API as api-master
  participant DB as PostgreSQL partner

  FE->>API: <doc>.update / approve / submit / reject / cancel {id, expectedVersion, …}
  API->>DB: BEGIN; SELECT status, version, deleted_at (update) | guarded UPDATE … AND deleted_at IS NULL (approve / transitions)
  alt deleted_at IS NOT NULL
    API->>DB: ROLLBACK (nothing written, no stock moved)
    API-->>FE: 409 <CODE>_DELETED
    FE->>FE: reload → read-only view
  else not deleted
    Note over API,DB: existing flow unchanged
  end
```

## Unchanged readers (D11)

Pickers and reports keep their existing queries. Each one reads `status = 'APPROVED'` documents, or `memo_stock` rows that approval wrote, and `<table>_deleted_check` forbids a deleted APPROVED row. See [architecture.md](architecture.md#readers-of-transaction-documents).
