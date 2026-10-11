# Backend dependency decisions: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md)

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|

Use proposed/approved/installed/rejected status. Record no additional packages when reusing
the current stack. New workers, queues, caches, or services need a justified ADR and total
capacity estimate. Installation occurs during approved implementation with serialized
manifest/lockfile updates by the integration owner; a proposal does not prove installation.
