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
