# API contract: reserve (SA revision 1, 2026-11-02, approved: owner 2026-11-02: "อนุมัติ reserve revision 1")

Typed tRPC router `reserve` on the master router (`/api/master/trpc`). The types are the [Memo Out revision 2](../memo-out/api-contract.md) types, with the document renamed. Consumer: [TODO reserve](../../../../task/todo/reserve.md) FE-RS-001…003.

```ts
type ReserveStatus = "PENDING_APPROVAL" | "APPROVED";
type ReserveLineInput = MemoLineInput & { memoStockId?: string | null };   // a From Stock line names its Memo Stock item
type ReserveInput = Omit<QuotationInput, "lines"> & { lines: ReserveLineInput[] }; // customerId + shippingAddressId + invoiceAddressId

type ReserveLine = ReserveLineInput & {
  id: string; source: "MANUAL" | "STOCK"; discountAmount: string; amount: string;
  memoStockId: string | null; stockId: string | null; stockPendingPcs: number | null; stockPendingWeightCt: string | null;
};
type Reserve = Omit<ReserveInput, "lines"> & {
  id; docNo; status: ReserveStatus; version; customer: { code; name }; shippingAddressText; invoiceAddressText;
  lines: ReserveLine[]; totals; approvedAt: string | null; approvedBy: string | null; createdAt; createdBy; updatedAt;
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `reserve.list` | reserve VIEW | `{q?, partyId?, status?, from?, to?, cursor?, limit? ≤ 50}` | `{items: {id, docNo, status, docDate, dueDate, customerName, currency, grandTotal, updatedAt}[], nextCursor, total}` |
| `reserve.get` | reserve VIEW | `{id}` | `Reserve` |
| `reserve.nextNumber` | reserve VIEW | `{docDate}` | `{docNo}` (Document Setup `reserve`) |
| `reserve.options` | reserve VIEW | `{customerId?}` | the `memoOut.options` shape |
| `reserve.create` | reserve ADD + CSRF | `ReserveInput` | `{id, docNo, version}` |
| `reserve.update` | reserve EDIT + CSRF | `{id, expectedVersion} & ReserveInput` | `{id, version}` (only PENDING_APPROVAL) |
| `reserve.delete` | reserve DELETE + CSRF | `{id, expectedVersion}` | `{ok: true}` (only PENDING_APPROVAL) |
| `reserve.approve` | reserve APPROVE + CSRF | `{id, expectedVersion}` | `{id, version, status: "APPROVED", stockLineCount}` |
| `memoStock.list` (changed) | adds `reserve:VIEW` to memo-return / memo-receive / memo-out VIEW | unchanged | unchanged |
| `currency.options` (changed) | adds `reserve:VIEW` | unchanged | unchanged |

Errors:

| Code | HTTP | When |
|---|---|---|
| `RESERVE_NOT_FOUND` | 404 | missing document |
| `RESERVE_CHANGED` | 409 | stale `expectedVersion` |
| `RESERVE_STATUS_INVALID` | 409 | update / delete / approve when not PENDING_APPROVAL |
| `RESERVE_REFERENCE_INVALID` | 422 | customer / address / currency / stone code / `lines.N.memoStockId` invalid |
| `RESERVE_PENDING_SHORT` | 409 | approve: a stock line asks more than the item's pending now (`lines.N.pcs` / `weightCt`, `exceeds_pending`) |
| `VALIDATION_ERROR` | 400 | field rules: `duplicate`, `exceeds_pending`, `required` (quantity / Sale Price), dates, bounds |
| `PERMISSION_DENIED` / `CSRF_INVALID` / `UNAUTHORIZED` | 403 / 403 / 401 | as every master procedure |

Compatibility: new procedures only. Memo Out, Memo Return and Memo Stock contracts are unchanged, apart from the extra permission on two reads.
