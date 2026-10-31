# API contract: memo-out + memo-out-return (SA revision 1, 2026-10-28)

Typed tRPC routers `memoOut` and `memoOutReturn` on the master router (`/api/master/trpc`). The types are the [quotation contract](../quotation/api-contract.md) types with these differences.

```ts
type Status = "DRAFT";                                      // SA-MO-03
type MemoLineInput = QuotationLineInput & { photoIds: [] }; // no photos in rev 1

type MemoOutInput = Omit<QuotationInput, "lines"> & { lines: MemoLineInput[] };   // customerId + shippingAddressId + invoiceAddressId
type MemoOutReturnLineInput = MemoLineInput & { outstandingPcs: number; outstandingWeightCt: string }; // UI rev 3: pcs/weightCt = Return, ≤ outstanding (else VALIDATION_ERROR lines.N.pcs|weightCt "exceeds_outstanding")
type MemoOutReturnInput = Omit<MemoOutInput, "customerId" | "shippingAddressId" | "invoiceAddressId" | "lines"> & { vendorId: string; addressId: string; lines: MemoOutReturnLineInput[] };

type MemoOut = MemoOutInput & { id; docNo; status: Status; version; customer: { code; name }; shippingAddressText; invoiceAddressText; lines (+ id, discountAmount, amount); totals; createdAt; createdBy; updatedAt };
type MemoOutReturn = MemoOutReturnInput & { id; docNo; status: Status; version; vendor: { code; name }; addressText; lines; totals; createdAt; createdBy; updatedAt };
// Detail lines of both documents carry outstandingPcs / outstandingWeightCt: numbers on memo out return, null on memo out.
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `<router>.list` | VIEW | `{q?, partyId?, from?, to?, cursor?, limit? ≤ 50}` | `{items: {id, docNo, status, docDate, dueDate, customerName \| vendorName, currency, grandTotal, updatedAt}[], nextCursor, total}` |
| `<router>.get` | VIEW | `{id}` | `MemoOut` / `MemoOutReturn` |
| `<router>.nextNumber` | VIEW | `{docDate}` | `{docNo}` (preview from Document Setup) |
| `memoOut.options` | VIEW | `{customerId?}` | same shape as `quotation.options` |
| `memoOutReturn.options` | VIEW | `{vendorId?}` | `{vendors: {id, code, name, active, currency, addresses: {id, label, isDefault}[]}[], currencies, companyCurrency, chargeTypes, stone}` |
| `<router>.create` | ADD + CSRF | input | `{id, docNo, version}` |
| `<router>.update` | EDIT + CSRF | `{id, expectedVersion} & input` | `{id, version}` |
| `<router>.delete` | DELETE + CSRF | `{id, expectedVersion}` | `{ok: true}` |

Errors: `VALIDATION_ERROR`, `<CODE>_NOT_FOUND` 404, `<CODE>_CHANGED` 409, `<CODE>_STATUS_INVALID` 409, `<CODE>_REFERENCE_INVALID` 422, `PERMISSION_DENIED`, `UNAUTHORIZED`; `<CODE>` = `MEMO_OUT` / `MEMO_OUT_RETURN`.

## SA revision 2 (2026-10-31, approved: owner 2026-10-31: "อนุมัติ memo-out revision 2")

Memo Out only ([decisions SA-MO-11…17](decisions.md)). Memo Out Return is unchanged. Consumer: [TODO memo-out](../../../../task/todo/memo-out.md) FE-MO-201…203.

```ts
type MemoOutStatus = "PENDING_APPROVAL" | "APPROVED";                 // SA-MO-11 (was "DRAFT")

// A line may name a Memo Stock item (stock line, SA-MO-12/13). The client still sends source "MANUAL"; the server
// stores STOCK for a stock line and overwrites its stock fields (stone, lot, location, cer, price unit) from the item.
type MemoOutLineInput = MemoLineInput & { memoStockId?: string | null };
type MemoOutInput = Omit<QuotationInput, "lines"> & { lines: MemoOutLineInput[] };

type MemoOutLine = MemoOutLineInput & {
  id: string; discountAmount: string; amount: string;
  memoStockId: string | null; stockId: string | null;            // null on manual lines
  stockPendingPcs: number | null; stockPendingWeightCt: string | null; // the item's pending at save (row maximum)
};
type MemoOut = Omit<MemoOutInput, "lines"> & {
  id; docNo; status: MemoOutStatus; version; customer: { code; name }; shippingAddressText; invoiceAddressText;
  lines: MemoOutLine[]; totals; approvedAt: string | null; approvedBy: string | null; createdAt; createdBy; updatedAt;
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `memoOut.list` | memo-out VIEW | rev 1 + `status?: MemoOutStatus` | rev 1 (status is the new enum) |
| `memoOut.create` / `update` / `delete` | ADD / EDIT / DELETE + CSRF | `MemoOutInput` (+ `id`, `expectedVersion`) | rev 1; update / delete only while PENDING_APPROVAL |
| `memoOut.approve` | memo-out **APPROVE** + CSRF | `{id, expectedVersion}` | `{id, version, status: "APPROVED", stockLineCount}` |
| `memoStock.list` | memo-return VIEW **or** memo-receive VIEW **or** memo-out VIEW | `{vendorId?, currency?, q?, from?, to?, cursor?, direction?, limit? ≤ 50}`; `vendorId` now optional | unchanged `{items: MemoStockRow[], nextCursor}` |

New / changed errors:

| Code | HTTP | When |
|---|---|---|
| `MEMO_OUT_PENDING_SHORT` | 409 | approve: a stock line asks more than its item's pending now (fields `lines.N.pcs` / `lines.N.weightCt`, code `exceeds_pending`) |
| `MEMO_OUT_STATUS_INVALID` | 409 | update / delete / approve when not PENDING_APPROVAL |
| `MEMO_OUT_REFERENCE_INVALID` `lines.N.memoStockId` | 422 | the Memo Stock item doesn't exist |
| `VALIDATION_ERROR` `lines.N.memoStockId` `duplicate` | 400 | the same item twice in one memo out |
| `VALIDATION_ERROR` `lines.N.pcs` / `weightCt` `exceeds_pending` | 400 | save: more than the item's pending; or both 0 (`required`) |
| `VALIDATION_ERROR` `lines.N.unitPrice` `required` | 400 | a stock line without a Sale Price (> 0) |

Compatibility:
- The `status` value changes from DRAFT to PENDING_APPROVAL. The only consumer is the Memo Out page, which changes in the same delivery.
- Lines without `memoStockId` behave exactly as before.
- `memoStock.list` callers that send `vendorId` (Memo Return) are unchanged.
