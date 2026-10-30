# API contract: memo-return (SA revision 2, as built 2026-10-30)

Typed tRPC routers `memoReturn` and `memoStock` on the master router (`/api/master/trpc`). The document types follow the [memo out contract](../memo-out/api-contract.md) with the differences below. The Memo Receive API (the source of Memo Stock) is in [memo-receive/api-contract.md](../memo-receive/api-contract.md). Diagrams: [flow](../../../../diagram/memo-return-flow.md), [sequence](sequence-diagram.md), [database](database-diagram.md).

Revision 1 (`sourceLineId` pointing at memo receive lines, status `DRAFT`, `memoReturn.memoStock`) is superseded and was never released.

```ts
type MemoReturnLineInput = MemoLineInput & {
  memoStockId: string;            // a Memo Stock item of the same vendor and currency, once per document
  outstandingPcs?: number;        // ignored: the server stores the item's pending quantity now
  outstandingWeightCt?: string;   // ignored, as above
};                                // pcs / weightCt = Return quantity, ≤ pending; item fields and price are overwritten from the item
type MemoReturnInput = Omit<MemoOutInput, "customerId" | "shippingAddressId" | "invoiceAddressId" | "lines"> & {
  vendorId: string; addressId: string; lines: MemoReturnLineInput[];   // 1..200 lines
};

type MemoReturn = MemoReturnInput & {
  id; docNo; status: "PENDING_APPROVAL" | "APPROVED"; version; vendor: { code; name }; addressText;
  lines: (MemoLine & { memoStockId: string; stockId: string; outstandingPcs: number; outstandingWeightCt: string })[];  // no stoneCodeId
  totals; approvedAt: string | null; approvedBy: string | null; createdAt; createdBy; updatedAt;
};

type MemoStockListInput = {
  vendorId: string; currency?: string /* ISO 4217 */; q?: string /* ≤ 100 */;
  from?: string; to?: string;     // receive doc date, range ≤ 366 days, to ≥ from
  cursor?: string | null;         // opaque keyset cursor (receive doc date | stock id)
  limit?: number;                 // 1..50, default 50
};
type MemoStockItem = {
  id; stockId; lot; location: "Memo"; itemNote;
  stone; shape; size; color; clarity; cutting; quality; cerType; cerNo;
  receivedPcs: number; receivedWeightCt: string; pendingPcs: number; pendingWeightCt: string;
  priceUnit: "CTS" | "PCS"; unitPrice: string; netUnitPrice: string /* 4 dp */; currency: string;
  amount: string;                 // line amount pro-rata to pending (weight for CTS, pcs for PCS), 2 dp
  vendor: { id; code; name };
  memoReceive: { id; docNo; docDate; dueDate };
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `memoReturn.list` / `get` / `nextNumber` | memo-return VIEW | as memo receive | as memo receive (`vendorName` in list items) |
| `memoReturn.options` | memo-return VIEW | `{vendorId?}` | vendors + addresses, currencies |
| `memoReturn.create` | memo-return ADD (CSRF) | `MemoReturnInput` | `{id, docNo, version}` (status `PENDING_APPROVAL`) |
| `memoReturn.update` | memo-return EDIT (CSRF) | `MemoReturnInput` + `id`, `expectedVersion` | `{id, version}`; pending documents only |
| `memoReturn.delete` | memo-return DELETE (CSRF) | `{id, expectedVersion}` | `{ok}`; pending documents only |
| `memoReturn.approve` | memo-return APPROVE (CSRF) | `{id, expectedVersion}` | `{id, version, status: "APPROVED"}`; moves pending → Return on each item |
| `memoStock.list` | memo-return VIEW **or** memo-receive VIEW | `MemoStockListInput` | `{items: MemoStockItem[], nextCursor}`; items with pending pcs or weight > 0 |

## Errors

| Code | HTTP | When |
|---|---|---|
| `MEMO_RETURN_NOT_FOUND` / `CHANGED` / `STATUS_INVALID` | 404 / 409 / 409 | missing; stale `expectedVersion`; edit, delete or approve of an approved document |
| `MEMO_RETURN_REFERENCE_INVALID` `lines.N.memoStockId` | 422 | item missing, of another vendor or of another currency |
| `VALIDATION_ERROR` `lines.N.memoStockId` `duplicate` | 400 | the same item twice in one document |
| `VALIDATION_ERROR` `lines.N.pcs` / `lines.N.weightCt` `exceeds_outstanding` | 400 | Return above the item's pending when saving |
| `MEMO_RETURN_PENDING_SHORT` `lines.N.pcs` / `lines.N.weightCt` `exceeds_pending` | 409 | at approval, another approved return already took the quantity; nothing changes |
| `VALIDATION_ERROR` `to` `before_from` / `range_too_long` | 400 | bad `memoStock.list` date range |
