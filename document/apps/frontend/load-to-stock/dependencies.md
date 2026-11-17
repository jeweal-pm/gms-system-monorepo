# Frontend dependency decisions: load-to-stock

- UI revision: 1 (draft)
- Result: **no new frontend package**. Every component (modal, radio cards, grouped rows, collapsible chevron, photo box, row panel) is built from existing components and the installed stack ([tech-stack](../../../adr/tech-stack.md)). No ledger entry is added.

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| — (none) | — | P-01, P-02, L-03…09 | n/a — existing components (C) | a table/grouping library: rejected, the shared table already renders group rows (Purchase merge view) | 0 | none | n/a | n/a |

Backend/runtime dependency (not a package): the owner's **new backend service** adds a container and is an SA + infra decision under the 4 GB / 2 vCPU budget ([SA handoff](../../../coordination/handoffs/load-to-stock-sa.md)).
