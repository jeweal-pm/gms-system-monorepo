# Main flow: memo-outstanding-vendor (UI revision 1 / SA revision 1, approved 2026-10-29)

This page is read-only. It covers each approved Memo Receive: how much came in, where it went, and what is left. Spec: [ui-spec](../apps/frontend/memo-outstanding-vendor/ui-spec.md). Sequences: [sequence-diagram](../apps/backend/master/memo-outstanding-vendor/sequence-diagram.md). Decision: [ADR-0035](../adr/0035-memo-outstanding-vendor-report.md).

```mermaid
flowchart TD
  A[Memo › Memo Outstanding › Vendor] -->|VIEW| B[KPIs + document list<br/>approved Memo Receive with Reserve or Outstanding > 0]
  A -->|no VIEW| X[No access]
  B --> F[Search / Vendor / Doc Date range / sort / page]
  F --> B
  B --> E{Expand a document<br/>or Show subtasks: Expanded}
  E --> I[Item rows from Memo Stock<br/>Memo · Return · Sold · Reserve · Outstanding · Price]
  I --> S[Tick items → n selected]
  S --> P[Print selected · PRINT]
  B --> P2[Print current page · PRINT]
  B --> C[Customize view: show/hide columns<br/>kept in this browser]
  B --> L[Doc Number → open the Memo Receive]
```

## Where the numbers come from

```mermaid
flowchart LR
  MR[Memo Receive approved] -->|received pcs/weight| M[(Memo Stock item)]
  RET[Memo Return approved · later] -->|returned| M
  SALE[Sale / Purchase approved · later] -->|sold| M
  RES[Reserve / Memo Out approved · later] -->|reserved| M
  M --> O[Outstanding = Memo − Return − Sold − Reserve]
```

Revision 1 has a writer for Memo only, so Return, Sold and Reserve are 0. The labels marked "later" depend on Q-MOV-04.
