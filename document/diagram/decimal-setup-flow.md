# Main flow: decimal-setup (UI revision 2 / SA revision 1, pending-review)

Sequence detail: [sequence-diagram](../apps/backend/master/decimal-setup/sequence-diagram.md). Decision: [ADR-0038](../adr/0038-global-decimal-setup.md).

```mermaid
flowchart TD
  S[Sign in] --> P[App Shell loads decimalSetup.get]
  P -->|ok| G[Global places: weight W 0-3, price P 0-2]
  P -->|error| D[Defaults: weight 2, price 2]
  G --> ALL[Every page: weights shown with W, money with P; new input capped at W / P]
  D --> ALL
  A[Setup › Decimal Setup tile] -->|decimal-setup:VIEW| V[View mode: Weight and Price selects + examples]
  A -->|no VIEW| X[Tile hidden / No access]
  V -->|decimal-setup:EDIT, Edit| E[Edit mode]
  E --> SV{Save}
  SV -->|409 changed| R[Banner: reload latest]
  SV -->|ok| OK[Toast saved → cache updated → all open tabs re-render]
  OK --> G
  E -->|Cancel with changes| C{Discard?}
  C -->|discard| V
  C -->|keep| E
```

Not affected by the setting: pcs, percentages, exchange and currency rates, stored values and server totals (2 dp).
