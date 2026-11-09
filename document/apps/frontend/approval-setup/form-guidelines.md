# Form guidelines: approval-setup

- UI revision: 1 (pending-review)
- Template: [form-login-guildlines.md](../template/form-login-guildlines.md). Most of it does not apply: this page has **no text fields, no submit button and no validation messages**. Each switch is an independent immediate control.

| Template topic | Application here |
|---|---|
| When to show errors | Only after a switch action (dialog/toast); never on load. Count errors show in the row. |
| Submit button | None. Each switch change goes through its own confirm (ON, OFF with nothing waiting) or blocking dialog. Phase 2 saves per switch, not as a page form. |
| Restricting input | Not applicable (no typing). |
| Required attributes | Switch: `role="switch"`, `aria-checked`, visible "On"/"Off" label linked with `aria-labelledby`; accessible name includes the menu: "Require approval for {Menu}" (visually hidden prefix). Disabled rows use `aria-disabled` + `aria-describedby` → "Not available yet" (existing `Switch` `hint`). Busy rows use `aria-busy="true"`. |
| Keyboard | Tab order: notice → per row: waiting link (if any) → switch. Space/Enter toggles. Dialogs: focus on the safe button (Cancel / Close); Esc closes; focus returns to the switch. |
| Unsaved changes | Phase 1 changes are intentionally unsaved and the notice says so; no "leave page?" prompt (default). |
