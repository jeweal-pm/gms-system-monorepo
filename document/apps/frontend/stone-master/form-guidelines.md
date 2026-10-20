# Form guidelines: stone-master (UI revision 1)

Validation runs in the browser (Zod, `onBlur`, re-validated on change) and again on the server. These are the defaults in [open-questions](open-questions.md) Q-SM-06/07; SA confirms them.

| Field | Pages | Rule | Message |
|---|---|---|---|
| Code Name\* | all except Stone Code | Required; trimmed; 1–20 of `A–Z a–z 0–9 . - /`; stored UPPERCASE; unique per page (case-insensitive, server) | "Code Name is required" / "Use up to 20 letters, digits, . - or /" / "This code is already used" |
| Name\* | all except Stone Code | Required; trimmed; ≤ 120 characters | "Name is required" / "Name must be at most 120 characters" |
| Active | all | Switch, default on | — |
| Stone Group\* | Stone Name | Required; an active group (or the saved, now-inactive one unchanged) | "Select a stone group" |
| HSN | Stone Name | Optional; digits only; 4–8 | "HSN must be 4–8 digits" |
| Sizes Available\* | Shape | 1–100 active sizes, no duplicates | "Select at least one size" |
| Mode | Stone Code | `AUTO` (default) or `MANUAL` | — |
| Stone Code\* | Stone Code | Auto: built, read-only, must not be empty. Manual: required, trimmed, 1–60 of `A–Z a–z 0–9 . - /`, stored UPPERCASE. Unique (case-insensitive, server) | "Choose the parts to build the code" / "Stone Code is required" / "This stone code is already used" |
| Parts at #1 and #2\* | Stone Code | Required, active option; the red asterisk follows the position in Part order (owner 2026-10-20) | "Select a {part} (positions #1 and #2 are required)" |
| Parts at #3–#7 | Stone Code | Optional (Name, Shape and Color included); Size needs a Shape and must be one of its sizes | "This size isn't available for the chosen shape" |
| Part order | Stone Code | A permutation of the 7 part keys | (not user-facing) |

- **Inputs:**
  - Code fields uppercase the text as you type, using CSS `uppercase` plus a transform on save.
  - Name keeps its casing.
  - `autoComplete="off"` on every field (autofill rule from 2026-10-16).
- **Read-only/view mode** uses the shared read-only field style (`bg-gms-field-disabled`).
- **Errors** appear under the field. The first invalid field gets focus on Save. A server field error maps to its field; anything else goes to a banner above the card.
