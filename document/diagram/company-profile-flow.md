# Main flow: company-profile

- UI revision: 1 (pending-review); spec: [ui-spec.md](../apps/frontend/company-profile/ui-spec.md)
- Service interactions are refined by SA ([handoff](../coordination/handoffs/company-profile-sa.md)); this file keeps the user flow only.

```mermaid
flowchart TD
  A[Setup landing] -->|Company Profile tile| B[/setup/company-profile/]
  B --> C{VIEW permission?}
  C -- no --> X[Access denied panel]
  C -- yes --> D{Profile exists?}
  D -- loading --> L[Skeleton]
  D -- error --> E[Page error + Retry] -->|Retry| D
  D -- no --> S[Setup mode: editable, Save/Cancel on, Edit off]
  D -- yes --> V[View mode: read-only, Edit on]
  V -->|Edit, needs EDIT| ED[Edit mode]
  S -->|Save| VAL{Valid?}
  ED -->|Save| VAL
  VAL -- no --> FE[Field errors, focus first] --> S
  VAL -- yes --> SV[Saving]
  SV -- ok --> T[Toast saved] --> V
  SV -- conflict --> CF[Conflict dialog] -->|Reload| D
  SV -- failed --> TE[Toast error, data kept] --> ED
  ED -->|Cancel with changes| DC[Discard dialog] -->|Discard| V
  S -->|Cancel with changes| DC2[Discard dialog] -->|Discard| S
```

Open transitions (see [open questions](../apps/frontend/company-profile/open-questions.md)): what Print and Excel produce (Q-CP-07); who has EDIT (Q-CP-10).
