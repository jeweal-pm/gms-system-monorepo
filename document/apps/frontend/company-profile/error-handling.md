# Frontend error handling: company-profile

- UI revision: 1 (pending-review)
- API/domain error mapping: pending the SA contract; the codes below are proposals that follow the partner conventions.

| User action | Error / condition | Feedback | Recovery | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open page | No VIEW permission | Access-denied panel (as partner) | Link back to Setup | heading announced | FE-CP-010 |
| Open page | Load failed / service unavailable | Inline page error "Couldn't load the company profile." | Retry button | focus Retry | FE-CP-009 |
| Open page | Options failed | Country/Currency selects disabled with "Couldn't load options" | Retry link by the field | — | FE-CP-005 |
| Save | Field validation (client) | Message under each field; editors and logo under their control | Fix and save again | first invalid field focused | FE-CP-004…008 |
| Save | Server validation (`VALIDATION_FAILED` with paths) | Same as client errors, mapped by field path | — | first invalid field | FE-CP-009 |
| Save | Version conflict (`CONFLICT`) | Dialog: "Someone else saved changes. Reload to see them." | Reload (your edits are lost) / Keep editing | focus dialog | FE-CP-009 |
| Save | No EDIT permission (`PERMISSION_DENIED`) | Toast; page switches to read-only | — | toast live region | FE-CP-010 |
| Save | Network / unavailable | Toast "Couldn't save. Try again."; the form keeps the entered data | Save again | toast live region | FE-CP-009 |
| Logo pick | Wrong type / too large | Inline error under the tile; the previous logo is kept | Pick another file | `aria-describedby` on the tile | FE-CP-006 |
| Logo display | Image fails to load | Empty tile + "Couldn't load logo" | Refresh | — | FE-CP-006 |
| Cancel / Refresh / leave | Unsaved changes | Discard dialog (in app); browser prompt (unload) | Keep editing / Discard | focus returns to the trigger | FE-CP-008 |
| Save success | — | Toast "Company profile saved"; View mode | — | focus stays on the header | FE-CP-009 |

Messages never include stack traces or server internals. Entered data is preserved on every failure except an explicit Discard or a conflict Reload.
