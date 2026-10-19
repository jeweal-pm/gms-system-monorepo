# Main flow: stone-master (UI revision 1, pending-review)

Source: [ui-spec](../apps/frontend/stone-master/ui-spec.md). SA refines the service interactions in its sequence diagram and does not duplicate this flow.

```mermaid
flowchart TD
  A[Setup › Master Code › Stone Master] --> B{stone-master:VIEW?}
  B -- no --> X[Menu hidden / access denied]
  B -- yes --> C[Stone Group page · Add mode · drawer open]
  C --> N[Context nav: pick one of 9 pages]
  N --> S[Simple page: Group / Size / Color / Cutting / Clarity / Quality]
  N --> SN[Stone Name: Code, Name, Stone Group*, HSN]
  N --> SH[Shape: Code, Name, Sizes Available*]
  N --> SC[Stone Code]
  S & SN & SH --> F{ADD?}
  F -- no --> RO[Disabled Add page]
  F -- yes --> SV[Fill → Save] --> V[View mode · row in drawer]
  SC --> M{Mode}
  M -- Auto --> AU[Choose parts · reorder → code built live] --> SV
  M -- Manual --> MA[Type code · choose parts] --> SV
  V --> E[Edit → Save / Cancel]
  V --> D[Delete] --> IU{In use?}
  IU -- yes --> MSG[Turn off Active instead]
  IU -- no --> DEL[Deleted → Add mode]
  V --> DU[Duplicate → draft, code cleared]
```

Open transitions: running-number codes (Q-SM-01) and per-page permissions (Q-SM-04) would change nodes F and B.
