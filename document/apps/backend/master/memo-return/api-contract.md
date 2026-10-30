# API contract: memo-receive + memo-return (SA revision 1)

Typed tRPC routers `memoReceive` and `memoReturn` on the master router (`/api/master/trpc`). Types follow the [memo out contract](../memo-out/api-contract.md) with these differences.

```ts
type MemoReceiveInput = Omit<MemoOutInput, "customerId" | "shippingAddressId" | "invoiceAddressId"> & { vendorId: string; addressId: string };

type MemoReturnLineInput = MemoLineInput & {
  sourceLineId: string;           // a memo receive line of the same vendor and currency
  outstandingPcs: number;         // ignored: the server stores the current pending quantity
  outstandingWeightCt: string;    // ignored, as above
};                                // pcs / weightCt = Return quantity, ≤ pending
type MemoReturnInput = Omit<MemoReceiveInput, "lines"> & { lines: MemoReturnLineInput[] };

type MemoReceive = MemoReceiveInput & { id; docNo; status: "DRAFT"; version; vendor: { code; name }; addressText; lines; totals; createdAt; createdBy; updatedAt };
type MemoReturn  = MemoReturnInput  & { id; docNo; status: "DRAFT"; version; vendor: { code; name }; addressText; lines /* + sourceLineId, outstandingPcs, outstandingWeightCt */; totals; createdAt; createdBy; updatedAt };

type MemoStockItem = {
  sourceLineId; memoReceiveId; memoReceiveNo; docDate; dueDate;
  stoneCodeId; stoneCode; stone; shape; size; color; clarity; cutting; quality; lot; location; cerType; cerNo; itemNote;
  priceUnit: "PER_CT" | "PER_PCS"; unitPrice: string;
  pendingPcs: number; pendingWeightCt: string; amount: string;   // amount = unitPrice × pending
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `memoReceive.list` / `get` / `nextNumber` | VIEW | as memo out | as memo out (`vendorName` in list items) |
| `memoReceive.options` | VIEW | `{vendorId?}` | as `memoOutReturn.options` |
| `memoReceive.create` / `update` / `delete` | ADD / EDIT / DELETE (CSRF) | `MemoReceiveInput` (+ `id`, `expectedVersion`) | `{id, docNo, version}` / `{id, version}` / `{ok}` |
| `memoReturn.list` / `get` / `nextNumber` / `options` | VIEW | as above | as above |
| `memoReturn.memoStock` | VIEW | `{vendorId, currency, q?, from?, to?, excludeReturnId?}` | `{items: MemoStockItem[]}` (≤ 200) |
| `memoReturn.create` / `update` / `delete` | ADD / EDIT / DELETE (CSRF) | `MemoReturnInput` (+ `id`, `expectedVersion`) | as above |

## Errors

| Code | HTTP | When |
|---|---|---|
| `MEMO_RECEIVE_*`, `MEMO_RETURN_*` `NOT_FOUND` / `CHANGED` / `STATUS_INVALID` / `REFERENCE_INVALID` | 404 / 409 / 409 / 422 | as memo out |
| `MEMO_RECEIVE_IN_USE` | 409 | edit or delete of a memo receive with returned lines |
| `MEMO_RETURN_REFERENCE_INVALID` `lines.N.sourceLineId` | 422 | source line missing, of another vendor or currency |
| `VALIDATION_ERROR` `lines.N.pcs` / `lines.N.weightCt` `exceeds_outstanding` | 400 | Return above pending |
| `VALIDATION_ERROR` `lines.N.sourceLineId` `duplicate` | 400 | the same source line twice |
