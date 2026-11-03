# Main flow: memo-outstanding-customer (UI revision 1 / SA revision 1, approved 2026-11-03)

This page is read-only. It covers each approved Memo Out: what we lent the customer, what came back, and what is still out. Spec: [ui-spec](../apps/frontend/memo-outstanding-customer/ui-spec.md). Decision: [ADR-0039](../adr/0039-memo-outstanding-customer-report.md).

```mermaid
flowchart TD
  A[Memo › Memo Outstanding › Customer] -->|VIEW| B[KPIs + document list<br/>approved Memo Out with stones still out]
  A -->|no VIEW| X[No access]
  B --> F[Search / Customer / Doc Date range / sort / page]
  F --> B
  B --> E{Expand a document<br/>or Show subtasks: Expanded}
  E --> I[Item rows: Memo · Return · Sold · Outstanding · Price]
  I --> S[Tick items → n selected → Print · PRINT]
  B --> L[Doc Number → open the Memo Out]
```

## Where the numbers come from

```mermaid
flowchart LR
  MO[Memo Out approved<br/>From Stock lines] -->|lent pcs/weight = Memo| L[(memo_out_line)]
  MOR[Memo Out Return approved] -->|returned_*| L
  SALE[Sale approved · later] -.->|sold| L
  L --> O[Outstanding = Memo − Return − Sold]
```
