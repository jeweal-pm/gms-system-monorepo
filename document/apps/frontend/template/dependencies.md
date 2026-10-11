# Frontend dependency decisions: <feature>

- UI revision: <revision>
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: proposed / no additional packages

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|

Compare actual installed components/packages first. Record estimated costs as estimates.
Keep proposals uninstalled until the relevant UI/SA bundle is approved. Frontend and the
integration owner perform package and lockfile edits serially during implementation.
If none is needed, explain the components/libraries reused instead.
