# Authorization: inventory / merge-split (SA revision 1, pending-review)

The menu leaf `merge-split` ("Merge/Split") already exists in `backend-api-auth/src/permission/catalog.ts` with the default actions, and `"merge-split"` is already in the inventory `Menu` type (`src/platform/auth/principal.ts`). **No auth change and no auth migration.** Inventory checks `requireGrant(principal, "merge-split", action)`.

| Action | Grant |
|---|---|
| options, next-number, list, get, stock picker, stock photos, photo download | VIEW |
| create | ADD |
| update | EDIT |
| submit, photo upload | ADD or EDIT |
| approve / request-revision / reject | APPROVE (+ VIEW) |
| delete / restore | DELETE |

- Every write needs CSRF and `expectedVersion`.
- No party scope: the document converts company stock.
- The picker never returns Memo Stock (vendor goods), Purchase lines, REVERSED stock or stock with 0 on hand.
- Photo download is allowed only for files linked to a `merge_split_result_photo` or a `stock_photo` (own stock) — never an arbitrary `stored_file` id.
- Master `stock-ids/issue` accepts only the inventory service token (existing `inventory-token.guard.ts`).
