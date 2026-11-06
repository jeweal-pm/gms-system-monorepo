# Main flow: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

This applies to Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order and Purchase. Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment and Sale follow the same flow when they are built ([ADR-0045](../adr/0045-transaction-document-soft-delete.md) D16). Service design: [decisions](../apps/backend/master/transaction-soft-delete/decisions.md), [sequences](../apps/backend/master/transaction-soft-delete/sequence-diagram.md). TODO: [transaction-soft-delete](../task/todo/transaction-soft-delete.md).

Nodes marked **(Dn)** are SA defaults the owner may change.

```mermaid
flowchart TD
  A[Document page · daybook rail] -->|VIEW| L[Normal list<br/>deleted documents hidden · D9]
  A --> F{Filter}
  F -->|All / status| L
  F -->|Deleted| DL[Deleted list<br/>same order and search · D9]
  L --> O[Open document]
  O -->|draft · DELETE grant| D[Delete → existing confirm text]
  O -->|approved · Quotation approved, rejected or cancelled| N[No Delete button<br/>only before approval · D1 D2]
  DL --> R0[Deleted document opened read-only<br/>banner Deleted by … on …]
  D -->|OK| S[Soft delete: who + when recorded<br/>status, lines, photos, Doc No. kept · D4 D5 D14<br/>no stock change]
  S --> CN[Page returns to Create New<br/>blank document, as today · OQ-3]
  R0 -->|DELETE grant| RS[Restore → confirm]
  R0 -->|no DELETE grant| V[View only]
  RS -->|OK| B[Back in the normal list<br/>same status, editable again · D6]
  B --> O
  R0 -.->|stale tab tries Save / Approve| E[This document was deleted<br/>reload read-only · D8]
  S -.-> P[Pickers / reports / Memo Stock / PO in Purchase:<br/>unchanged — they read approved documents only · D11]
```
