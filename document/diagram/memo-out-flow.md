# Main flow: memo-out (SA revision 2, approved 2026-10-31)

Memo Out sends stones to a customer on memo. Stock rows come from **From Stock**, which is Memo Stock (stones borrowed from vendors through approved Memo Receives) until our own stock exists. Rows added by hand cut nothing.

```mermaid
flowchart LR
  MR[Memo Receive approved] -->|creates| MS[(Memo Stock<br/>pending)]
  MS -->|From Stock picker| MO[Memo Out<br/>Pending Approval]
  H[Add row by hand] --> MO
  MO -->|Save / Edit: nothing cut| MO
  MO -->|Approve| A{pending enough?}
  A -->|yes| R[Memo Stock: pending → Reserve<br/>Memo Out Approved, read-only]
  A -->|no| E[MEMO_OUT_PENDING_SHORT<br/>edit the row and approve again]
  R -.->|later revision| MOR[Memo Out Return:<br/>Reserve → pending]
  R -.-> REP[Memo Outstanding › From Vendor<br/>shows Reserve]
```

Details: [sequence](../apps/backend/master/memo-out/sequence-diagram.md), [database](../apps/backend/master/memo-out/database-diagram.md), [SA decisions](../apps/backend/master/memo-out/decisions.md).
