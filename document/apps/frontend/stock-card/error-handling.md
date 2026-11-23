# Frontend error handling: stock-card

- UI revision: 1
- API/domain error mapping: assumed contract in [data-fetching](data-fetching.md); SA confirms codes in its error-handling document. The page maps by transport status (`FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, other) so it does not depend on custom domain codes.

The feature is read-only: there are no forms to save and no data to preserve besides the filters, which always stay in the URL.

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open the list | No VIEW grant | Page text "You don't have access to Stock Card" (no toolbar, no table) | none | text in the page flow | FE-SC-004 |
| Open the list | Server / network failure | Banner (`role="alert"`) "Couldn't load Stock Card." above an empty area; filters stay | **Retry** button refetches | banner announced; focus stays | FE-SC-004 |
| Open the list | Some source unavailable (partial, only if SA keeps two sources) | Warning banner "Some stock couldn't be loaded" + loaded rows | Retry | `role="status"` | FE-SC-004 |
| Open the list | No rows | Empty card "No stock to show." (no filter) or "No stock matches these filters." + **Clear filters** | Clear filters resets URL state | button focusable | FE-SC-004 |
| Filters | Due before Start | Existing inline text under the range (`dateRangeProblem`); the query is not sent | fix a date | `aria-invalid` on the inputs | FE-SC-004 |
| Filters | Search longer than `SEARCH_MAX` | input stops at the limit (`maxLength`) | — | — | FE-SC-004 |
| Page / size in URL out of range | `page` > last page after a filter | clamp to page 1 (URL replaced) | automatic | — | FE-SC-004 |
| Click a row / open detail | Key unknown or stock gone | Page text "This stock card no longer exists." + link "Back to Stock Card" | link | focus on the link | FE-SC-005 |
| Detail rows | Server / network failure | Banner "Couldn't load transactions." + Retry; the header block stays | Retry | as above | FE-SC-006 |
| Detail rows | No rows in the period | "No transactions in this period." (filters) / "No transactions." + Clear filters | Clear | — | FE-SC-006 |
| Click DOC NO | The document is deleted or the user lacks its VIEW | Handled by the destination page (its own not-found / no-access text) | browser Back returns to the card | — | FE-SC-006 |
| Print | Popup blocked / print unavailable | Browser behaviour; the print icon stays enabled | — | — | FE-SC-011 |
| Excel | Not available | The icon is `aria-disabled` with title "Excel export isn't available yet" | — | tooltip on focus | FE-SC-011 |
| Session expired | 401 | Existing session guard redirects to login; no stack traces or internal ids shown | log in again | — | existing |

Messages never show internal ids, SQL, or stack traces. Link: [form-guidelines](form-guidelines.md), [ui-spec](ui-spec.md#states), [testing](testing.md).
