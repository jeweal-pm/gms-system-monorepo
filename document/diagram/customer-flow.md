# Customer flow

- **Feature / UI revision / SA revision:** `customer` / 1 / 1 (SA pending-review)
- **Source:** [ADR-0018](../adr/0018-customer-master-partner-service.md) (Accepted 2026-10-14), screenshots in [source/](../apps/frontend/customer/source/); UI spec `document/apps/frontend/customer/` (ui-spec, in progress)
- **Last updated:** 2026-10-14

Main user flow for Setup › Customer (`/setup/customer`). Service interactions are in the
[partner + gateway sequence diagrams](../apps/backend/partner/customer/sequence-diagram.md);
they are not duplicated here. ui-spec may refine screen-level states in the UI spec.

```mermaid
flowchart TD
    A["Setup › Customer tab<br/>or sidebar Partner Master › Customer"] --> G{"customer:VIEW<br/>or Super Admin?"}
    G -->|"no"| X["Access denied state"]
    G -->|"yes"| B["Add Customer: new draft form<br/>+ Customers drawer (list, count, search)"]

    B --> F["Fill Customer Information, Basic Information,<br/>Invoice and Shipping addresses"]
    F --> AA["Add another / remove address<br/>(1..10 per type), Set as default"]
    AA --> F
    F --> S["Create Customer (needs ADD)"]
    S --> V{"Client validation ok?"}
    V -->|"no"| E["Red fields + messages"]
    E --> F
    V -->|"yes"| SV{"Server result"}
    SV -->|"VALIDATION_ERROR"| E
    SV -->|"CUSTOMER_CODE_TAKEN"| EC["Code Name field error"]
    EC --> F
    SV -->|"PARTNER_UNAVAILABLE"| EU["Error banner; refresh list<br/>before trying again"]
    EU --> F
    SV -->|"created"| R["Saved customer opens;<br/>drawer refreshes (Name bold, Code Name below)"]

    B --> Q["Search / scroll drawer (pages of 50)"]
    Q --> D["Select a customer"]
    D --> R
    R --> ED["Edit fields, Save (needs EDIT)"]
    ED --> SU{"Server result"}
    SU -->|"saved"| R
    SU -->|"CUSTOMER_STALE"| ST["Changed elsewhere: reload record"]
    ST --> R
    SU -->|"CUSTOMER_NOT_FOUND"| B

    R --> DU["Duplicate (needs ADD)"]
    DU --> DF["New draft with copied data,<br/>Code Name cleared"]
    DF --> F
    R --> PR["Print (browser print)"]
    R --> RF["Refresh (confirm if unsaved changes)"]
    RF --> R
    R --> DC["Delete (needs DELETE): confirm dialog"]
    DC -->|"cancel"| R
    DC -->|"confirm"| DL{"Server result"}
    DL -->|"deleted or already gone"| B
    DL -->|"PARTNER_UNAVAILABLE"| DC
    B --> XL["Excel button disabled (not in revision 1)"]
```
