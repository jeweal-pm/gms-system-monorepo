# Flow: merge-split (UI revision 1, pending-review)

Main user flow of Inventory › Merge/Split ([ui-spec](../apps/frontend/merge-split/ui-spec.md)). SA adds service interactions in its own bundle without duplicating this flow.

```mermaid
flowchart TD
  A[Open Merge/Split] --> B{VIEW grant?}
  B -- no --> X[No-access page]
  B -- yes --> C[New document: Doc Date, Ref.]
  C --> D[From Stock: own Stock IDs, on hand > 0]
  D --> E{First pick?}
  E -- yes --> F[Mode dialog: Split or Merge]
  E -- no --> G[Reuse document mode]
  F --> H[Result table]
  G --> H
  H --> I[Edit rows: qty for Split, location, grading, prices]
  I --> J{Validation + totals match?}
  J -- no --> I
  J -- yes --> K{Approval ON?}
  K -- no --> L[Save = Approved: sources reduced, new Stock IDs created]
  K -- yes --> M[Save = Draft] --> N[Send to approve = Pending]
  N --> O{Approve Center}
  O -- Approve --> L
  O -- Revise --> M
  O -- Reject --> P[Rejected, final]
  L --> Q[Stock Card: source OUT, new stocks IN]
  L --> R{New stock used?}
  R -- no --> S[Edit / Delete reverses and re-applies]
  R -- yes --> T[Locked]
```

Open transitions: Q-MS-14 (Cancelled vs Delete/Reject), Q-MS-15 (pending holds), Q-MS-16 (re-convert results).
