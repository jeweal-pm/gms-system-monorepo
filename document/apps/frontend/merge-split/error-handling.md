# Error handling: merge-split (UI revision 1)

Error codes are assumed (SA confirms); handling mirrors Load to Stock (C).

| Case | Assumed code | UI |
|---|---|---|
| No VIEW | 403 | "You don't have permission to view Merge/Split." page |
| No ADD/EDIT/DELETE | 403 | Buttons hidden; a direct call → toast "You don't have permission" |
| Not found | 404 | "Merge/Split not found." |
| Validation | 400 `VALIDATION` with row index | "Row n: …"; scroll to the row |
| Source changed (on hand moved, held, or on another pending doc) | 409 `STOCK_CHANGED` + `{stockId, availablePcs, availableWeightCt}` | Row error "{Stock ID} changed, available now …"; edits kept; user re-picks |
| Stale document | 409 `MERGE_SPLIT_CHANGED` | Conflict message, Refresh offered, edits kept |
| New stock in use (edit/delete after apply) | 409 `IN_USE` | "A new stock is already used — cannot edit or delete" |
| Totals mismatch (client) | — | S-06 banner; Save blocked |
| Picker / options load failure | 5xx / network | Inline error + Retry; page stays usable |
| Number preview failure | — | "—" in the header; Save still works |
| Photo upload failure | 4xx/5xx | Toast on the photo box; row kept |
