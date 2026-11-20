# Main flow: sale (UI revision 1, pending-review)

A Sale sells stones to a customer. Rows come from **From Reserve** (open lines of the customer's approved Reserves) or **From Stock** (Memo Stock now; own stock from Load to Stock in phase 2, Q-SL-01). Saving moves nothing; stock moves at Approve (ADR-0050). Dashed edges are later revisions. SA refines the service interactions in its own sequence diagram without duplicating this flow.

```mermaid
flowchart LR
  MR[Memo Receive approved] -->|creates| MS[(Memo Stock<br/>pending)]
  MS -->|Reserve Approve| RSV[(Memo Stock reserved<br/>+ Reserve line open)]
  LS[Load to Stock approved] -.->|phase 2| OS[(Own stock on hand)]

  RSV -->|From Reserve<br/>same customer + currency| SL[Sale<br/>Draft]
  MS -->|From Stock| SL
  OS -.->|From Stock phase 2| SL

  SL -->|Save / Edit: nothing moves| SL
  SL -->|Send to approve| PA[Pending Approval]
  PA -->|Revise / Reject| SL
  PA -->|Approve, approval OFF: auto on Save| CHK{enough open / pending?}
  CHK -->|no| ERR[Not enough available<br/>stays pending]
  CHK -->|yes| AP[Sale Approved, read-only]
  AP --> E1[Reserve line sold += q<br/>Memo Stock reserved → sold]
  AP --> E2[Memo Stock pending → sold]
  AP -.-> E3[Own stock on hand → sold]
  E1 --> PUR[Purchase › Add Memo Stock › Sold<br/>must be purchased from vendor]
  E2 --> PUR
  E1 --> RPT[Memo Outstanding › Vendor: Sold column]
  E2 --> RPT
```

Service interactions (SA rev 1, pending-review): [inventory/sale sequence diagrams](../apps/backend/inventory/sale/sequence-diagram.md) and [ADR-0054](../adr/0054-sale-document.md) — Sale in `backend-api-inventory`; the stock effects above are applied by master in one idempotent call at Approve (or auto-approved Save).

Open transitions: Q-SL-02 (service placement), Q-SL-03 (reservation consumption), Q-SL-09 (approval), Q-SL-16 (no reversal) in [open questions](../apps/frontend/sale/open-questions.md). UI: [ui-spec](../apps/frontend/sale/ui-spec.md).
