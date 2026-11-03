# Main flow: quotation From Stock (SA revision 2, approved 2026-11-03)

A quotation is an offer. From Stock copies a stone's details into it and takes nothing (owner 2026-11-03). From Stock is Memo Stock until our own stock exists.

```mermaid
flowchart LR
  MR[Memo Receive approved] -->|creates| MS[(Memo Stock<br/>pending)]
  OWN[(Our own stock<br/>later, inventory)] -.->|later| FS
  MS --> FS[From Stock<br/>Add From Stock dialog]
  FS -->|copy details only| QT[Quotation rows<br/>Stock ID, read-only stone fields]
  H[Add row / typed row] --> QT
  QT -->|Save / Edit / Delete| SAVED[Quotation saved<br/>no Approve step]
  SAVED -.->|nothing taken or held| MS
  SAVED -.->|later revision| NEXT[Reserve / Memo Out / Sale]
```

- Memo Stock pending and Memo Outstanding never change because of a quotation.
- The same stone can be on several quotations at once.

Details: [SA decisions](../apps/backend/master/quotation/decisions.md#sa-revision-2-2026-11-03--from-stock-approved), [sequence](../apps/backend/master/quotation/sequence-diagram.md), [database](../apps/backend/master/quotation/database-diagram.md), [ADR-0038](../adr/0038-quotation-from-stock.md).
