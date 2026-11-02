# Main flow: reserve (SA revision 1, approved 2026-11-02)

A Reserve holds stones for a customer until they are sold. From Stock is Memo Stock until our own stock exists. Rows keyed in by hand hold nothing.

```mermaid
flowchart LR
  MR[Memo Receive approved] -->|creates| MS[(Memo Stock<br/>pending)]
  MS -->|From Stock| RS[Reserve<br/>Pending Approval]
  H[Row keyed in by hand] --> RS
  RS -->|Save / Edit: nothing held| RS
  RS -->|Approve| A{pending enough?}
  A -->|yes| R[Memo Stock: pending → Reserve<br/>Reserve Approved, read-only]
  A -->|no| E[RESERVE_PENDING_SHORT<br/>edit and approve again]
  R -.->|later revision| SALE[Sale: Reserve → Sold]
  R -.->|later revision| REL[Release: Reserve → pending]
  R -.-> REP[Memo Outstanding › From Vendor<br/>Reserve column]
```

Details: [SA decisions](../apps/backend/master/reserve/decisions.md), [sequence](../apps/backend/master/reserve/sequence-diagram.md), [database](../apps/backend/master/reserve/database-diagram.md).
