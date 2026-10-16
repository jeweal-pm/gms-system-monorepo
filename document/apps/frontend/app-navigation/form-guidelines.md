# Form guidelines: app-navigation

- Feature ID / UI revision: `app-navigation` / 1 (pending-review)
- Template: [form-login-guildlines.md](../template/form-login-guildlines.md)

**Not applicable.** This feature has no form, input field, validation or submit action. The sidebar, rail,
Setup landing page and Master Code modal contain only links and buttons. The project form rules (error timing,
submit button behavior, input restrictions, `autocomplete`/`inputMode`/labels) therefore do not apply.

Related interaction rules that do apply are in [ui-spec.md](ui-spec.md#interaction-and-behavior): every control
has a visible label or an `aria-label`, focus is always visible, and the modal handles Escape and focus return.
If a later revision adds a sidebar search or filter field, this document must be completed for that field.
