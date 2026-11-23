# Form guidelines: stock-card

- UI revision: 1
- The shared template (`template/form-login-guildlines.md`, Thai) targets forms with Submit. **Stock Card has no form, no Submit and no entered data to save**: it is a read-only report with filter controls. Only the rules that apply to the filter controls are used:

| Rule (template) | Applied here |
|---|---|
| Show an error only after blur, then on change | The only validation is the date range (Due before Start); it shows as soon as both dates are set and clears when fixed |
| Do not disable a button because the form is wrong | The print icon is disabled only when there are no rows to print (as Memo Outstanding); Retry and Refresh are never disabled except while loading |
| Do not silently block typing | The search input accepts any text up to `SEARCH_MAX` (a hard `maxLength`, stated in the error table); no numeric-only fields exist |
| trim before validating | The search text is trimmed before it is applied to the URL |
| Attributes: `label`, `autocomplete`, `inputMode` | Every control has an accessible name: the search input `aria-label` = its placeholder, the location select `aria-label="Location"`, the date inputs `aria-label="Start date"` / `"Due date"`; `autocomplete="off"` on search; no numeric input |

Keyboard: Tab order is search, location, Start, Due, tool icons, table (rows, then DOC NO links), pager. Enter on a focused list row opens the detail; Escape closes the view panel and returns focus to the columns button (C pattern of `CustomizeViewPanel`).
