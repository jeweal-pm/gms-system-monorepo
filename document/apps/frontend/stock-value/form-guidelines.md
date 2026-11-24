# Form guidelines: stock-value

- UI revision: 1
- Same as [Stock Card form guidelines](../stock-card/form-guidelines.md): **Stock Value has no form, no Submit and no entered data to save.** It is a read-only report with filter controls. The shared form template (`template/form-login-guildlines.md`) therefore applies only to the filter controls:

| Rule (template) | Applied here |
|---|---|
| Show an error only after blur, then on change | The only validation is the date range (Due before Start); it shows as soon as both dates are set and clears when fixed; the query is not sent while it is wrong |
| Do not disable a button because the form is wrong | Print is disabled only when there are no rows to print; Retry and Refresh are never disabled except while loading; **Excel is permanently `aria-disabled` with a tooltip in revision 1** (feature not available, not a form error) |
| Do not silently block typing | The search input accepts any text up to `SEARCH_MAX` (a hard `maxLength`); no numeric-only fields exist |
| trim before validating | The search text is trimmed before it is applied to the URL |
| Attributes: `label`, `autocomplete`, `inputMode` | Every control has an accessible name: search `aria-label` = its placeholder, location select `aria-label="Location"`, date inputs `aria-label="Start date"` / `"Due date"`; `autocomplete="off"` on search; no numeric input |

Keyboard: Tab order is search, location, Start, Due, tool icons, table (rows, then DOC NO links on the detail), pager. Enter on a focused list row opens the detail; Escape closes the Customize-view panel and returns focus to the columns button.
