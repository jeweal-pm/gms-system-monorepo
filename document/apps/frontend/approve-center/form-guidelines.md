# Form guidelines: approve-center

- UI revision: 1 (approved 2026-11-07)

Revision 1 has no data-entry form. The only inputs are:

- **Search** (C-AP-05): free text, trimmed, ≤ 100 characters (the list API limit; longer input is cut with no error), debounced 300 ms, Esc clears. It has a visually hidden label "Search {Menu} approvals" in addition to the placeholder.
- **Checkboxes** (selection): not a form; they never submit by themselves.
- **Confirm dialogs**: no fields.

The Reject… / Revise… reason dialog in [ui-spec.md](ui-spec.md#reject-and-revise-owner-decision-requires-sa) is not built in revision 1. When the owner approves it, it follows the project rules in [the template guidelines](../template/form-login-guildlines.md): reason validated on blur then on change, submit never disabled for invalid input (only while sending), error under the field linked with `aria-describedby`, entered text kept on server error.
