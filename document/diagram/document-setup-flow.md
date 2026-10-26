# Main flow: document-setup (UI revision 1, pending-review)

```mermaid
flowchart TD
  A[Setup › Document Setup tile] -->|VIEW| B[Page: drawer of transactions, first selected]
  A -->|no VIEW| X[Tile hidden / No access]
  B --> C{Setup saved for this transaction?}
  C -->|yes| D[View mode: saved Name, Code, Start From, rows, Declaration]
  C -->|no| E[View mode: defaults + "Not set up yet"]
  D --> F{EDIT permission?}
  E --> F
  F -->|no| D
  F -->|yes, Edit| G[Edit mode]
  G --> H[Change fields / + Add row / remove row]
  H --> I{Save}
  I -->|invalid| H
  I -->|409 changed| J[Banner: reload latest]
  I -->|ok| K[Toast saved → view mode, list refreshed]
  G -->|Cancel or pick another transaction with changes| L{Discard changes?}
  L -->|keep| G
  L -->|discard| D
```

Open transitions: what happens to rows already used by documents (Q-DS-06) and how real transactions take the next number (outside this page; SA).
