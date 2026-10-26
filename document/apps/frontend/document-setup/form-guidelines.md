# Form guidelines: document-setup

- Feature ID / UI revision: `document-setup` / 1 (pending-review)
- Base rules: [form-login-guildlines.md](../template/form-login-guildlines.md) — first check on blur, then on every change; Submit checks all fields and focuses the first invalid one; Save is disabled only while saving.

| Field | Rule | Error message |
|---|---|---|
| Name\* | trim; 1–120 characters | "Name is required" / "Name must be at most 120 characters" |
| Code\* | trim; 1–10 of `A–Z 0–9 - /`; stored UPPERCASE (typed in any case, shown uppercase); unique across transactions (server) | "Code is required" / "Use up to 10 letters, digits, - or /" / "This code is already used" |
| Start From\* | digits only (input blocked to digits, `inputMode="numeric"`); 1–999,999,999 | "Start From is required" / "Enter a number from 1 to 999,999,999" |
| Numbering rows | at least 1 row; at most 50 rows | "Add at least one numbering row" / "Up to 50 rows" |
| Row Date\* | valid date; unique within the table | "Date is required" / "Another row already starts on this date" |
| Row Prefix | optional; up to 10 of `A–Z 0–9 - / .`; stored UPPERCASE | "Use up to 10 letters, digits, - / or ." |
| Row Separator ("Suffix") | optional; up to 3 of `- / . _` | "Use up to 3 of - / . _" |
| Row Start No\* | digits only, 1–999,999,999 | "Start No is required" / "Enter a number from 1 to 999,999,999" |
| Declaration | optional; up to 2,000 characters; line breaks kept; not trimmed inside, trailing spaces trimmed | "Declaration must be at most 2,000 characters" |

- Row errors show under the cell (italic, as other fields) and the row gets a red left border; the first invalid cell gets focus on Save.
- "+ Add row" focuses the new row's Date.
- Rows are re-sorted by Date when a Date loses focus, not while typing, so the row does not jump under the cursor.
- Code uppercases as you type (CSS `uppercase` + transform on save), same as Stone Master codes.
- Autocomplete off on all fields.
