# Location Master — main user flow (UI rev 1, pending-review)

```mermaid
flowchart LR
  A[Setup › Master Code] --> B[Location Master]
  B --> C{Record}
  C -->|Create Location| D[Name* + Active] --> E[Save] --> F[Listed in the drawer]
  C -->|Pick in drawer| G[View] -->|Edit| D
  G -->|Delete| H[Confirm] --> F
  F -->|active names| I[Purchase Order / Purchase row › Location dropdown]
  I --> J[Saved document keeps the name]
```

Unknowns: Q-LM-01…05 in the [ui-spec](../apps/frontend/location-master/ui-spec.md#open-questions). Service interactions: [sequence-diagram](../apps/backend/master/location-master/sequence-diagram.md).
