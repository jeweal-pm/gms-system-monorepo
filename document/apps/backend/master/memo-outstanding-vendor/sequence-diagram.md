# Sequence diagrams: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

- Source UI revision / SA revision: 1 / 1
- Main flow: [memo-outstanding-vendor-flow](../../../../diagram/memo-outstanding-vendor-flow.md)
- Operations: [api-contract](api-contract.md); TODO BE-MOV-001…003, FE-MOV-001…004

## 1. Open the page / change filters

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend (/memo/memo-outstanding/vendor)
  participant NG as nginx :8080
  participant M as api-master (tRPC memoOutstanding.*)
  participant A as auth view (ADR-0031)
  participant DB as PostgreSQL schema partner

  U->>FE: open page, search (300 ms debounce), vendors, dates, sort, page
  par KPIs
    FE->>NG: memoOutstanding.vendorSummary(filters)
    NG->>M: proxy
    M->>A: memo-outstanding-vendor:VIEW
    M->>DB: one aggregate over approved memo_receive and open memo_stock (counts, sum of open value x rate)
    M-->>FE: {documents, overdue, dueIn7Days, grandTotal, companyCurrency}
  and List page
    FE->>M: memoOutstanding.vendorList(filters, page, pageSize, sort)
    M->>DB: SELECT ... GROUP BY memo_receive.id HAVING open > 0 ORDER BY sort, id LIMIT/OFFSET, plus COUNT
    M-->>FE: {items, total}
  and Vendor filter (once, cached 60 s)
    FE->>M: memoOutstanding.vendorOptions()
    M-->>FE: {vendors}
  end
  alt PERMISSION_DENIED, UNAUTHORIZED or 503
    M-->>FE: error: no-access page, sign-in or retry banner
  end
```

## 2. Expand documents (one, or the whole page in Expanded mode)

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant M as api-master
  participant DB as PostgreSQL partner

  FE->>M: memoOutstanding.vendorItems {memoReceiveIds up to 25}
  M->>M: memo-outstanding-vendor:VIEW, uuids, max 25
  M->>DB: SELECT memo_stock join memo_receive (APPROVED), count of line photos WHERE memo_receive_id = ANY(ids) ORDER BY doc, position
  M-->>FE: {items} (unknown or unapproved ids skipped)
  FE->>FE: cache 30 s per document, selection to Print view
```

No step writes. Print is client-side (`window.print`).
