# Main flow: Purchase Order (revision 1, approved 2026-11-04)

```mermaid
flowchart TD
  A[Purchase Order page] --> B[Key in rows<br/>no From Stock / Memo Stock]
  B --> C[Save]
  C --> D{{Pending Approval}}
  D -->|Edit + Save| D
  D -->|Delete| X[Deleted]
  D -->|Approve<br/>purchase-order:APPROVE| E{{Approved · read-only}}
  E --> F[Items waiting to be purchased<br/>ordered pcs / weight, purchased 0]
  F -.->|later revision| G[Purchase PU page<br/>buys part or all, issues Stock IDs]
  F -.->|later revision| H[Purchase Outstanding report]
```

Sources: [ui-spec](../apps/frontend/purchase-order/ui-spec.md), [SA decisions](../apps/backend/master/purchase-order/decisions.md), [ADR-0041](../adr/0041-purchase-order-document.md).
