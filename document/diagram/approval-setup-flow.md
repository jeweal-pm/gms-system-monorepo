# Main flow: approval-setup (UI revision 1, pending-review)

Setup › Approval switches, per document type, whether a saved document needs approval. Phase 1 changes only local page state (not saved). Dashed edges are phase 2 / open questions and need SA. SA refines service interactions in its own bundle.

```mermaid
flowchart LR
  T[Setup tile Approval<br/>phase 1: Super Admin only] --> P[/setup/approval]
  P --> R[11 rows in sidebar order<br/>defaults: Quotation off, others on]
  R --> C[Waiting counts<br/>list status=PENDING_APPROVAL limit 1]
  C -->|n > 0| L[n documents ›] --> AP[/approve/menu]
  R -->|switch Off → On| CO[Confirm Turn on] -->|Turn on| ON[On · local only · toast Not saved yet]
  R -->|switch On → Off| K{Waiting count}
  K -->|loading| W[busy, wait]
  K -->|> 0| B[Can't turn off approval yet<br/>Close · Go to Approve]
  B -->|Go to Approve| AP
  K -->|0| CF[Confirm Turn off] -->|Turn off| OFF[Off · local only · toast Not saved yet]
  K -->|error| E[Couldn't check · Try again]
  R -->|not available row| NA[disabled · Not available yet]
  ON -.->|phase 2 SA-AS-01| S[(approval setting)]
  OFF -.->|phase 2 server re-checks SA-AS-02| S
  S -.->|SA-AS-03/04| D[Document Save:<br/>Off → APPROVED + stock at Save<br/>On → PENDING_APPROVAL]
  S -.->|SA-AS-06 / FE-AS-009| AC[Approve Center menus follow settings]
```

Details: [ui-spec](../apps/frontend/approval-setup/ui-spec.md), [data-fetching](../apps/frontend/approval-setup/data-fetching.md), [open questions](../apps/frontend/approval-setup/open-questions.md).
