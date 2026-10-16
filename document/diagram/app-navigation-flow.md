# App navigation flow

- **Feature / UI revision / SA revision:** `app-navigation` / 1 (**pending-review**) / none (no service interaction)
- **Source:** screenshots in [source/](../apps/frontend/app-navigation/source/); UI spec [app-navigation/ui-spec.md](../apps/frontend/app-navigation/ui-spec.md)
- **Last updated:** 2026-10-15 (ui-spec, revision 1)

Main user flow for the global sidebar (expanded, collapsed rail, mobile drawer), the Setup landing page and the
Master Code modal. Written by ui-spec from the screenshots; transitions not shown in the source are proposals
and reference their open question. There is no service call in this flow (static navigation); the session guard
is the existing `AppShell` behavior.

```mermaid
flowchart TD
    A["Signed-in page (AppShell)"] --> W{"Viewport ≥ 768 px?"}
    W -->|"no"| DM["Topbar menu button"]
    DM --> DR["Drawer: expanded sidebar<br/>(focus trapped, Escape closes)"]
    W -->|"yes"| P{"Saved preference<br/>(localStorage)"}
    P -->|"expanded or none"| EX["Expanded sidebar 236 px"]
    P -->|"collapsed"| RL["Collapsed rail 56 px"]

    EX -->|"⇆ Collapse sidebar (Q-NAV-07)"| RL
    RL -->|"⇆ Expand sidebar"| EX
    RL -->|"hover / focus"| TT["Tooltip with module name"]
    RL -->|"group button (Q-NAV-02)"| EXG["Expand + scroll to group<br/>+ focus first item"]
    EXG --> EX

    EX --> L{"Item kind"}
    DR --> L
    RL -->|"Home / Dashboard / Setup / Approve"| NAV
    L -->|"link"| NAV["Navigate; item active<br/>(drawer closes)"]
    L -->|"disclosure parent"| DS["Toggle children (› / ⌄)"]
    DS --> L

    NAV --> R{"Destination"}
    R -->|"/"| HOME["Home"]
    R -->|"/modules/slug"| PH["Placeholder: title + breadcrumbs<br/>(unknown slug: 'ไม่พบเมนู')"]
    R -->|"/setup"| SET["Setup landing: 4 tiles"]

    SET -->|"Company Profile"| PH
    SET -->|"Notifications"| PH
    SET -->|"User and Permission"| UP["/setup/user-permission<br/>(existing page + Setup tabs)"]
    SET -->|"Master Code"| MC["Master Code modal<br/>(focus on first tile)"]
    MC -->|"Escape / scrim / Close"| SET
    MC -->|"Partner Master (Q-NAV-04)"| VEN["/setup/vendor<br/>(existing page + Setup tabs)"]
    MC -->|"Currency, Stone, Location,<br/>Certificate, Labor, Sale Person (Q-NAV-05)"| PH
```

## Notes

- Active state: Setup is active on `/setup`, `/setup/*` and the Setup-owned placeholders; a disclosure child's
  parent opens automatically on load/navigation.
- Badges (red dots) are not part of this flow in revision 1 (Q-NAV-06, deferred SA topic).
- Permission-based hiding is not part of this flow (Q-NAV-11); destination pages keep their own access checks.
- SA refines service interactions only if a later revision adds badges or menu permissions; it does not duplicate
  this main flow.
