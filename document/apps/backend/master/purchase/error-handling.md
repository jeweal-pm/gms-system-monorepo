# Service error handling: master / purchase (SA revision 1, approved 2026-11-04)

| Condition | Source | tRPC / HTTP | `domainCode` (fieldErrors) | Frontend behaviour (FE-PU-003…005) |
|---|---|---|---|---|
| No session | auth context | UNAUTHORIZED 401 | `UNAUTHENTICATED` | Shared sign-in handling |
| Authorization view or license check unavailable | auth context | SERVICE_UNAVAILABLE 503 | `AUTHORIZATION_UNAVAILABLE` | Shared transient message; edits kept |
| License not eligible | auth context | FORBIDDEN 403 | `LICENSE_REQUIRED` | Shared licence handling |
| Missing grant | `permitted("purchase", …)` | FORBIDDEN 403 | `PERMISSION_DENIED` | Page text (VIEW) or toast (writes) |
| CSRF missing or invalid | `permitted(…, true)` | FORBIDDEN 403 | `CSRF_INVALID` | Toast "Please reload the page" |
| Input shape or bounds, source rule, duplicate row, pcs and weight both 0, price ≤ 0, discount bounds, bad cursor, date range | zod strict + superRefine | BAD_REQUEST 400 | `VALIDATION_ERROR` (`lines.N.<field>` / `required`, `not_allowed`, `duplicate`, `exceeds_gross`; `discount.value` / `exceeds_subtotal`; `to` / `before_from`, `range_too_long`; `cursor` / `invalid`) | Field or row errors; first bad row opened |
| Document missing | service | NOT_FOUND 404 | `PURCHASE_NOT_FOUND` | "Purchase not found." |
| Stale `expectedVersion`, or a doc-number race (P2002) | service | CONFLICT 409 | `PURCHASE_CHANGED` | "This purchase was changed by someone else. Refresh to see the latest." Edits kept |
| Update or delete of an approved purchase; approve of an approved one | service | CONFLICT 409 | `PURCHASE_STATUS_INVALID` | "This purchase is approved and can no longer be changed." |
| Vendor or address inactive or foreign; currency unknown; stone code invalid; memo stock item of another vendor or currency, or missing; PO line missing, of another vendor or currency, or PO not APPROVED; P2003 mid-save | service | UNPROCESSABLE_ENTITY 422 | `PURCHASE_REFERENCE_INVALID` (`vendorId`, `addressId`, `currency`, `lines.N.stoneCodeId`, `lines.N.memoStockId`, `lines.N.purchaseOrderLineId`, `(reference)`) | Field error on Vendor or on the row ("Choose again") |
| **Save:** a source quantity above its current availability (no lock) | `prepare` | BAD_REQUEST 400 | `VALIDATION_ERROR` (`lines.N.pcs` / `lines.N.weightCt` / `exceeds_available`) | Row error "More than the available n"; nothing saved |
| **Approve:** a source quantity no longer available (another purchase, return, memo out or reserve was approved first), or a PO line no longer valid | `takeForPurchase` under lock | CONFLICT 409 | `PURCHASE_PENDING_SHORT` (every short `lines.N.pcs` and/or `lines.N.weightCt` / `exceeds_available`) | Toast naming the row(s); rows marked; the purchase stays Pending Approval and no stock changes; the user edits (lowers or removes rows), saves and approves again |
| Foreign currency without exchange rate | engine | BAD_REQUEST 400 | `VALIDATION_ERROR` (`exchangeRate` / `required`) | Field error |
| Totals overflow DECIMAL(18,2) | engine | BAD_REQUEST 400 | `VALIDATION_ERROR` (`totals…` / `too_big`) | Toast |
| DB connection, pool, transaction timeout (lock wait > 4 s) | `purchaseErrors.map` (`isPrismaUnavailable`) | SERVICE_UNAVAILABLE 503 | `PARTNER_UNAVAILABLE` | Shared transient toast; edits kept; reads retry once |
| Anything else | `domainCall` | SERVICE_UNAVAILABLE 503 | `DEPENDENCY_UNAVAILABLE` | As 503 |

Rules:

- Every domain error is built with `documentErrors("PURCHASE", "Purchase", "purchase")` plus two factories: `purchasePendingShort(fields)` (409) and `purchaseStockIdExhausted()` (409).
- Any error inside a transaction rolls it back. A save's number and lines are all-or-nothing (Purchase issues no Stock IDs, ADR-0051). An approve's status change and every stock move are all-or-nothing. Save and delete never move stock (D2).
- `PENDING_SHORT` lists every short line, not only the first, so the user can fix them all at once.
- Messages never contain SQL, stack traces, prices or other vendors' data.
- The CHECKs `memo_stock_balance`, `memo_stock_purchased_check` and `purchase_order_line_purchased_check` are a last line of defence. If one fires (23514), the guard has a bug: the error is logged as `purchase.check_violation` and returned as `PURCHASE_CHANGED`, and integration tests IT-PU-B02/B03 must keep it unreachable.
