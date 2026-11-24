# Frontend error handling: stock-value

- UI revision: 1
- API/domain error mapping: assumed contract in [data-fetching](data-fetching.md); SA confirms codes in its error-handling document. The page maps by transport status and the shared Stock Card helpers (`isPermissionDenied`, `isCardMissing`, `loadErrorMessage`), so it does not depend on custom domain codes.

The feature is read-only: there are no forms to save and no data to preserve besides the filters, which always stay in the URL.

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Open the list | No VIEW grant | Page text "You don't have access to Stock Value" (no toolbar, no table) | none | text in the page flow | FE-SV-006 |
| Open the list | Server / network failure, 503 busy or timeout | Banner (`role="alert"`) "Couldn't load Stock Value." above an empty area; filters stay | **Retry** refetches | banner announced; focus stays | FE-SV-006 |
| Open the list | Prices cannot be read | **No partial state** (prices are read in the same statement as balances, SA revision 1): the normal error banner above | Retry | — | FE-SV-006 |
| Open the list | No rows | Empty card "No stock to show." (no filter) or "No stock matches these filters." + **Clear filters** | Clear filters resets URL state | button focusable | FE-SV-006 |
| List rows | A card has no price (`priceSource: "NONE"`) | Price "—" with caption "No price", Amount "—", Profit/Loss "—"; Total says "n without price" | none (data issue; set a Sale Price in Load to Stock or make a sale) | "—" has `aria-label="No value"` | FE-SV-003/006 |
| List rows | Unknown `priceSource` / `unit` value from a newer server | caption and unit render "—"; the number still shows | none | — | FE-SV-003 |
| Filters | Due before Start | Existing inline text under the range (`rangeProblem`); the query is not sent | fix a date | `aria-invalid` on the inputs | FE-SV-006 |
| Filters | Search longer than `SEARCH_MAX` | input stops at the limit (`maxLength`) | — | — | FE-SV-006 |
| Page / size in URL out of range | `page` > last page after a filter | clamp to page 1 (URL replaced) | automatic | — | FE-SV-006 |
| Sort by Profit/Loss (list) | Some rows have "—" | They sort last in both directions (server) | — | `aria-sort` on the header | FE-SV-006 |
| Click a row / open detail | Key unknown or stock gone | Page text "This stock card no longer exists." + link "Back to Stock Value" | link | focus on the link | FE-SV-007 |
| Detail rows | Server / network failure | Banner "Couldn't load transactions." + Retry; the header block stays | Retry | as above | FE-SV-008 |
| Detail rows | No rows in the period | "No transactions in this period." (filters) / "No transactions." + Clear filters | Clear | — | FE-SV-008 |
| Click DOC NO | The document is deleted or the user lacks its VIEW | Handled by the destination page (its own not-found / no-access text) | browser Back returns to the card | — | FE-SV-008 |
| Print | Popup blocked / print unavailable | Browser behaviour; the print icon stays enabled | — | — | FE-SV-011 |
| Print | No PRINT grant | The print icon is not rendered | — | — | FE-SV-011 |
| Excel | Not available (revision 1) | The icon is `aria-disabled` with title "Excel export isn't available yet" | — | tooltip on focus | FE-SV-011 |
| Session expired | 401 | Existing session guard redirects to login; no stack traces or internal ids shown | log in again | — | existing |

Messages never show internal ids, SQL, or stack traces. The UI shows no unit cost (only the Profit/Loss result), and the Last-sale tooltip shows only the Sale number and date the API returned. Link: [form-guidelines](form-guidelines.md), [ui-spec](ui-spec.md#states), [testing](testing.md).
