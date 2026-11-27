# Authorization: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

The menu leaf is `stock-adjustment`. It already exists in `backend-api-auth/src/permission/catalog.ts` and the Inventory menu. Inventory checks it with `requireGrant(principal, "stock-adjustment", action)` and needs `"stock-adjustment"` added to the `Menu` type (`src/platform/auth/principal.ts`).

| Action | Grant |
|---|---|
| options, next-number, list, get, stock picker | VIEW |
| create | ADD |
| update | EDIT |
| submit | ADD or EDIT |
| approve / request-revision / reject | APPROVE (+ VIEW) |
| delete / restore | DELETE |

- Every write requires CSRF and the `expectedVersion` check.
- The document has no party, so there is no per-party scoping.
- Location is a free choice among active Location Master names. It is validated against `master.reference().locations` on create and update.
- The picker never returns Memo Stock (vendor goods) or other locations, and never returns stock with 0 on hand.
