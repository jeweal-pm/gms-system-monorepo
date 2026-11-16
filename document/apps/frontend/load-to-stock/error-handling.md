# Frontend error handling: load-to-stock

- UI revision: 1 (draft). Error codes are placeholders until the SA contract; the shared domain-error mapper is reused (C `trpc-error`, `flow-status.mapFlowError`).

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open page | no VIEW | page "You don't have permission to view Load to Stock." | — | heading | FE-LS-002 |
| Open saved | not found / load error | "Load to Stock not found." / shared error text | Refresh | — | FE-LS-002 |
| From Purchase | Account (vendor) not set and Q-LS-01 alt. chosen | — (default: picker opens for all vendors) | — | — | FE-LS-004 |
| Picker | list error | inline in dialog + Retry | Retry | focus Retry | FE-LS-004 |
| Picker | no lines | "No purchase lines left to load" | Close | — | FE-LS-004 |
| Mode dialog | Merge with fewer than 2 lines. Mixed price units **are allowed** (owner Q-LS-08) | Merge card disabled with "Pick at least 2 lines to merge". The merged row shows the highest-priced line's details and photos (Q-LS-27) | choose None/Split | `aria-disabled` + description | FE-LS-005 |
| From Purchase (later pick) | the document already has a mode (one mode per document, owner Q-LS-07) | no mode dialog; toast "Added with mode {mode}". Mode change hint: "Empty the Load table to choose another mode" | remove all load rows | — | FE-LS-005 |
| Picker | a line of another vendor | not listed: the picker is filtered by `vendorId`, one vendor per document (owner Q-LS-03) | — | — | FE-LS-004 |
| Edit pcs/weight | above remaining / ≤ 0 | field error "Up to {p} pcs / {w} ct left on {PU}" | fix value | on blur, focus first error at Save | FE-LS-006/007 |
| Split | Σ children above remaining | group row hint in red + row errors | reduce / remove child | — | FE-LS-007 |
| Save | missing Location / Stock Price / Sale Price (required, start empty, owner Q-LS-13) / required header | field errors; toast "Row n: Location is required" | fix | focus first invalid | FE-LS-010 |
| Save / Approve | remaining changed on the server (`*_EXCEEDS_REMAINING`) | toast "Row n: only {p} pcs / {w} ct left on {PU}" | reduce or remove row | — | FE-LS-010 |
| Save / Send / Delete | stale `expectedVersion` | shared conflict message; edits kept | Refresh | — | FE-LS-010 |
| Edit / Delete (approval OFF) | stock already used (`*_IN_USE`) | toast "Some stock from this load is already used; it can't be changed." Buttons disabled when `inUse` | — | — | FE-LS-009 |
| Send to approve | setting changed | `mapFlowError` (C) refetches setting | retry | — | FE-LS-009 |
| Row photos | type/size/count | ADR-0048 messages (C) | — | — | FE-LS-008 |
