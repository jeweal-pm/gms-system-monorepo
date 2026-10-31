# API contract: memo-out-return (SA revision 2, approved 2026-10-31)

Typed tRPC router `memoOutReturn` on the master router (`/api/master/trpc`). Header, totals, charges and numbering are as the [memo out contract](../memo-out/api-contract.md). Decisions: [decisions.md](decisions.md).

```ts
type MemoOutReturnLineInput = MemoLineInput & {
  memoOutLineId: string;          // an approved Memo Out line of the same customer and currency, once per document
  outstandingPcs?: number;        // ignored: the server stores outstanding now
  outstandingWeightCt?: string;   // ignored
};                                // pcs / weightCt = Return now, ≤ outstanding, one of them > 0; other item fields are overwritten
type MemoOutReturnInput = Omit<MemoOutInput, "lines"> & {   // customerId, shippingAddressId, invoiceAddressId as Memo Out
  lines: MemoOutReturnLineInput[];   // 1..200, From Stock lines of approved Memo Outs only
};
type MemoOutReturn = MemoOutReturnInput & {
  id; docNo; status: "PENDING_APPROVAL" | "APPROVED"; version; customer: { code; name }; shippingAddressText; invoiceAddressText;
  lines: (MemoLine & { memoOutLineId; memoOut: { id; docNo }; memoStockId: string; stockId: string; outstandingPcs: number; outstandingWeightCt: string })[];
  totals; approvedAt: string | null; approvedBy: string | null; createdAt; createdBy; updatedAt;
};

type MemoOutOutstandingInput = {
  customerId: string; currency: string;
  q?: string; from?: string; to?: string;   // Memo Out doc date, ≤ 366 days
  excludeReturnId?: string; cursor?: string | null; limit?: number /* 1..50, default 50 */;
};
type MemoOutOutstandingItem = {
  memoOutLineId; memoOut: { id; docNo; docDate; dueDate };
  memoStockId: string; stockId: string; lot; location;   // stock lines only
  stone; shape; size; color; clarity; cutting; quality; cerType; cerNo; itemNote;
  outPcs: number; outWeightCt: string; returnedPcs: number; returnedWeightCt: string;
  outstandingPcs: number; outstandingWeightCt: string;
  priceUnit: "PER_CT" | "PER_PCS"; unitPrice: string /* Memo Out net, 2 dp */; amount: string; currency: string;
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `memoOutReturn.list` / `get` / `nextNumber` | VIEW | as memo out (`partyId` = customer) | `customerName` in list items |
| `memoOutReturn.options` | VIEW | `{customerId?}` | the `memoOut.options` shape (customers with Shipping / Invoice addresses, currencies, company currency, charge types, numbering) |
| `memoOutReturn.outstanding` | VIEW | `MemoOutOutstandingInput` | `{items: MemoOutOutstandingItem[], nextCursor}` |
| `memoOutReturn.create` | ADD (CSRF) | `MemoOutReturnInput` | `{id, docNo, version}`, status PENDING_APPROVAL |
| `memoOutReturn.update` | EDIT (CSRF) | + `id`, `expectedVersion` | `{id, version}`; pending only |
| `memoOutReturn.delete` | DELETE (CSRF) | `{id, expectedVersion}` | `{ok}`; pending only |
| `memoOutReturn.approve` | APPROVE (CSRF) | `{id, expectedVersion}` | `{id, version, status: "APPROVED"}` |

## Errors

| Code | HTTP | When |
|---|---|---|
| `MEMO_OUT_RETURN_NOT_FOUND` / `CHANGED` / `STATUS_INVALID` | 404 / 409 / 409 | as memo return |
| `MEMO_OUT_RETURN_REFERENCE_INVALID` `customerId` / `shippingAddressId` / `invoiceAddressId` / `lines.N.memoOutLineId` | 422 | party or address invalid; line missing, not approved, manual (not From Stock), other customer or currency |
| `VALIDATION_ERROR` `lines.N.memoOutLineId` `duplicate` | 400 | same Memo Out line twice |
| `VALIDATION_ERROR` `lines.N.pcs` / `weightCt` `exceeds_outstanding` / `required` | 400 | above outstanding on save; both zero |
| `MEMO_OUT_RETURN_OUTSTANDING_SHORT` `lines.N.pcs` / `weightCt` `exceeds_outstanding` | 409 | at approval another return already took it; nothing changes |
| `VALIDATION_ERROR` `to` `before_from` / `range_too_long` | 400 | picker date range |
