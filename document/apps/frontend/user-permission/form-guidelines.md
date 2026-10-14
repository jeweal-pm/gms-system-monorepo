# Form guidelines applied: user-permission

- Feature ID / UI revision: `user-permission` / 1
- Project guideline: [form guidelines template](../template/form-login-guildlines.md) (error timing, submit button, input restriction, attributes)
- Related: [ui-spec.md](ui-spec.md), [error-handling.md](error-handling.md), [open questions](open-questions.md)

## Fields

| Field | Required | Rules (client) | Attributes | Error text (source copy where shown) | Open item |
|---|---|---|---|---|---|
| Photo | No | `image/jpeg` or `image/png` only; size/dimension limits TBD | `accept="image/jpeg,image/png"`; hidden file input behind a labeled button | Proposed: "Only JPEG or PNG files are allowed" / "File is too large" | Q-UP-11 |
| Active | n/a (default on, as shown) | boolean | `role="switch"` | none | Q-UP-12 |
| Username | Yes (`*`) | trimmed; format/uniqueness TBD (email?) | `autocomplete="username"`; `inputMode="email"` if it is an email | "Username is required" (S2) | Q-UP-08, C-05 |
| Password | Shown as required in S2, but no `*` | 4–64 characters, not trimmed (Password Policy §1) | `type="password"`, `autocomplete="new-password"` | "Password is required" (S2). Policy messages (spec 0003): "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" / "รหัสผ่านต้องมีไม่เกิน 64 ตัวอักษร". The English UI equivalent is pending Q-UP-25. | Q-UP-01, Q-UP-07 |
| Name | Yes (`*`) | trimmed, non-empty; max length TBD by SA | `autocomplete="name"` | "Name is required" (S2) | |
| Phone No. | Shown as required in S2, but no `*` | Digits only (block non-digits, as the guideline requires); validation by country is pending | `type="tel"`, `inputMode="numeric"`, `autocomplete="tel-national"`; country selector `autocomplete="tel-country-code"` | "Phone No. is required" (S2) | Q-UP-01, Q-UP-09 |
| Location | Yes (`*`) | at least 1 selection | combobox/listbox pattern | Not shown; proposed "Location is required" | Q-UP-10 |
| Permissions | Not shown | Is at least one permission required? TBD | table of checkboxes | none | Q-UP-13 |

## Timing (from the project guideline)

- No errors are shown while the user is first typing. The first check happens on blur.
- Once a field shows an error, it is re-checked on every change so the error clears as soon as it is fixed.
- Submit checks every field and moves focus (and scroll) to the first invalid field in visual order: Username → Password → Name → Phone No. → Location.
- The Create User button is **not** disabled because the form is invalid. It is disabled only while submitting, and then shows its loading state.
- Trim surrounding whitespace before validating every field except Password.

## Edit mode (pending Q-UP-14)

Edit-mode rules are not specified until the owner answers. The questions are: username read-only
(C-05), password blank = unchanged (Q-UP-01/07), and what the Save button says.
