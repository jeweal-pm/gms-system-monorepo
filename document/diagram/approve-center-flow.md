# Main flow: approve-center (UI revision 1, pending-review)

Approve Center lists documents in `PENDING_APPROVAL` per document type and approves them through each document's existing `approve` procedure. Dashed edges are open questions (Q-AP-01/02/07) and are not designed yet. SA refines service interactions in its own bundle.

```mermaid
flowchart LR
  S[Sidebar Approve<br/>total badge] --> R{/approve}
  R -->|first menu with pending| M[Approve › Menu]
  P[Approve panel<br/>count · off · not available] --> M
  M -->|available| L[Pending list<br/>status = PENDING_APPROVAL<br/>deleted = false]
  M -->|Quotation off / none pending| E[Empty: Nothing waiting]
  M -->|no page yet| NA[Not available yet<br/>provisional columns]
  L --> SR[Search / sort / Load more]
  L -->|doc no.| D[Document page]
  L -->|Approve| C[Confirm] --> A[get version → approve]
  L -->|select rows| B[Approve selected<br/>one at a time] --> A
  A -->|ok| OK[Row leaves · counts refresh · toast]
  A -->|changed / no longer pending / deleted| RF[Refetch list · toast]
  A -->|stock short| SH[Inline: open the document to fix]
  L -.->|Reject… Q-AP-01, requires SA| RJ[Rejected?]
  L -.->|Revise… Q-AP-02, requires SA| RV[Back to creator?]
```

Details: [ui-spec](../apps/frontend/approve-center/ui-spec.md), [data-fetching](../apps/frontend/approve-center/data-fetching.md), [open questions](../apps/frontend/approve-center/open-questions.md).
