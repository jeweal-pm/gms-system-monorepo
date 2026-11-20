# Main flow: load-to-stock (UI revision 1, draft)

Load to Stock takes lines of approved Purchases (MANUAL / PO rows, which have no Stock ID since [ADR-0051](../adr/0051-purchase-lines-without-stock-id.md)) into stock, fully or partly. A PU line stays available until its remaining pcs is 0. Approval follows [ADR-0050](../adr/0050-approval-setting-draft-send-to-approve.md).

Spec: [ui-spec](../apps/frontend/load-to-stock/ui-spec.md). Questions: [open-questions](../apps/frontend/load-to-stock/open-questions.md). Service design: [SA revision 1, pending-review](../apps/backend/inventory/load-to-stock/architecture.md) ([sequence diagrams](../apps/backend/inventory/load-to-stock/sequence-diagram.md), [ADR-0052](../adr/0052-load-to-stock-in-backend-api-inventory.md)), service `backend-api-inventory`; SA refines service interactions without duplicating this flow. Nodes marked **(Q-LS-nn)** follow an unanswered default.

```mermaid
flowchart TD
  A[Inventory › Load to Stock] -->|load-to-stock:VIEW| B[New load · No. preview LS… from Document Setup]
  A -->|no VIEW| X[No access message]
  B --> C[Doc Date · Account · Currency · Ref.]
  C --> D[From Purchase → Add From Purchase dialog<br/>approved PU lines, MANUAL/PO, remaining pcs above 0 · Q-LS-05]
  D -->|tick lines · OK| M{How should these PU lines go into stock?}
  M -->|Back to list| D
  M -->|None| N[One load row per PU line<br/>edit details, pcs ≤ remaining, weight ≤ remaining]
  M -->|Split| S[Group per PU line + child rows<br/>+ Split adds a row · Σ ≤ remaining · own location Q-LS-10]
  M -->|Merge ≥2 lines| G[One row · Σpcs Σweight · avg price<br/>details from max THB/pc line · pcs/weight locked Q-LS-08/09]
  N --> L[Load table · Location required · More panel: Price · Stock Price · Sale Price · photos · note]
  S --> L
  G --> L
  L -->|From Purchase again: same document mode, no mode dialog · Q-LS-07| D
  L -->|Load table emptied| M
  L --> SV{Save · approval setting for load-to-stock}
  SV -->|invalid| E[Field / row errors] --> L
  SV -->|approval OFF| AP[Applied at once: PU remaining deducted<br/>stocks created, Stock IDs issued Q-LS-04<br/>status Approved green]
  SV -->|approval ON| DR[Draft grey · nothing deducted]
  DR -->|Edit| L
  DR -->|Send to approve| PE[Pending orange · locked]
  PE -->|Approve in Approve Center<br/>re-check remaining under lock Q-LS-06| AP2[Approved: PU deducted, stocks + Stock IDs]
  PE -->|Revise once, reason| RV[Revise · editable] -->|Send again| PE
  PE -->|Reject, reason| RJ[Rejected · final]
  PE -->|remaining changed| EE[Row n: only x pcs left] --> L
  AP -->|Edit / Delete until any stock used Q-LS-19| L
  AP -->|stock used| LK[Locked]
  AP2 --> RO[Read-only]
  AP --> R[PU line leaves the picker when remaining pcs = 0]
  AP2 --> R
```

## Phase 2 (SA revision 2, Proposed)

Own stock in From Stock (one list, holds through inventory): main sequences in [sequence-diagram § Phase 2](../apps/backend/inventory/load-to-stock/sequence-diagram.md#phase-2-sa-revision-2-proposed) (8 picker merge, 9 Quotation copy, 10 acquire → local, 11 edit/delete release, 12 Memo Out Return). Not copied here.
