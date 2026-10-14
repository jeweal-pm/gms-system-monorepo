# User and permission flow

- **Feature / UI revision:** `user-permission` / 1 (pending-review)
- **Source:** [UI spec](../apps/frontend/user-permission/ui-spec.md), screenshots in [source/](../apps/frontend/user-permission/source/)
- **Last updated:** 2026-10-12

This is the main user flow taken from the screenshots. Dashed edges are transitions the screenshots do not
show; they are labeled with their open question ([open-questions.md](../apps/frontend/user-permission/open-questions.md)).
SA refines the service interactions in its own bundle and does not duplicate this flow.
Service sequences (SA revision 1, pending-review): [auth + gateway sequence diagrams](../apps/backend/auth/user-permission/sequence-diagram.md).
Proposed answers to the dashed-edge questions: [SA decisions](../apps/backend/auth/user-permission/decisions.md).

```mermaid
flowchart TD
    A["Setup › User and permission tab"] --> G{"Allowed to manage users?<br/>(Q-UP-20)"}
    G -.->|"no"| X["Access denied state"]
    G -->|"yes"| B["Add User and Permission<br/>new draft + Users drawer (S1)"]

    B --> F["Fill personal info + permissions (S3)"]
    F --> S["Click Create User"]
    S --> V{"Client validation passes?"}
    V -->|"no"| E["Inline field errors (S2)<br/>focus first invalid"]
    E --> F
    V -->|"yes"| L{"Server: limit / license / unique?<br/>(C-01..C-03, Q-UP-05/06)"}
    L -.->|"rejected"| FE["Form-level error"]
    FE --> F
    L -.->|"created"| OK["Success feedback (not in source)<br/>drawer list refreshes"]

    B --> D["Select a saved user in drawer"]
    D -.->|"edit mode (Q-UP-14)"| ED["Edit form + Save"]
    D --> DU["Click Duplicate"]
    DU --> DD["New draft with permissions copied<br/>toast (S5); Q-UP-03/04"]
    DD --> F

    D -.->|"delete trigger (Q-UP-15)"| DC["Delete User …? dialog (S4)"]
    DC -->|"Keep user / Esc"| D
    DC -->|"Delete"| DL["Deleting... (S4)"]
    DL -.->|"success"| B
    DL -.->|"failure"| DC

    B --> T["Toggle drawer (S1 ↔ S2)"]
    T --> B
    F -.->|"switch user / refresh with unsaved changes (Q-UP-19)"| U["Confirm discard"]
```
