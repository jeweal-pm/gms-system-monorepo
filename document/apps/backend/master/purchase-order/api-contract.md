# API contract: purchase-order (SA revision 1, 2026-11-04, approved 2026-11-04)

Typed tRPC router `purchaseOrder` on the master router (`/api/master/trpc`). Types reuse the [memo-receive contract](../memo-receive/api-contract.md) and the [quotation contract](../quotation/api-contract.md). Consumer: TODO [purchase-order.md](../../../../task/todo/purchase-order.md) FE-PO-001…003.

```ts
type PurchaseOrderStatus = "PENDING_APPROVAL" | "APPROVED";                 // SA-PO-03

// Keyed-in lines only (SA-PO-06): source "MANUAL", no memoStockId; location is free text ≤ 40 (Q-PO-06).
type PurchaseOrderLineInput = Omit<QuotationLineInput, "memoStockId"> & { source: "MANUAL"; photoIds: string[] }; // ≤ 5 distinct
type PurchaseOrderInput = Omit<MemoReceiveInput, "lines"> & { lines: PurchaseOrderLineInput[] }; // vendorId + addressId, header, discount, tax, charges, labor

type PurchaseOrderLine = PurchaseOrderLineInput & {
  id: string; discountAmount: string; amount: string;
  purchasedPcs: number; purchasedWeightCt: string;                        // 0 until the Purchase page exists (SA-PO-05)
};
type PurchaseOrder = PurchaseOrderInput & {
  id: string; docNo: string; status: PurchaseOrderStatus; version: number;
  vendor: { code: string; name: string }; addressText: string; lines: PurchaseOrderLine[]; totals: Totals;
  approvedAt: string | null; approvedBy: string | null; createdAt: string; createdBy: string; updatedAt: string;
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `purchaseOrder.list` | purchase-order VIEW | `{q?, partyId?, status?, from?, to?, cursor?, limit? ≤ 50}` | `{items: {id, docNo, status, docDate, dueDate, vendorName, currency, grandTotal, updatedAt}[], nextCursor, total}` |
| `purchaseOrder.get` | purchase-order VIEW | `{id}` | `PurchaseOrder` |
| `purchaseOrder.nextNumber` | purchase-order VIEW | `{docDate}` | `{docNo}` |
| `purchaseOrder.options` | purchase-order VIEW | `{vendorId?}` | `memoReceive.options` shape + stone codes |
| `purchaseOrder.create` | purchase-order ADD + CSRF | `PurchaseOrderInput` | `{id, docNo, version}` |
| `purchaseOrder.update` | purchase-order EDIT + CSRF | `{id, expectedVersion} & PurchaseOrderInput` | `{id, version}` |
| `purchaseOrder.delete` | purchase-order DELETE + CSRF | `{id, expectedVersion}` | `{ok: true}` |
| `purchaseOrder.approve` | purchase-order APPROVE + CSRF | `{id, expectedVersion}` | `{id, version, status: "APPROVED", lineCount}` |

| Route | Grant | Input | Output |
|---|---|---|---|
| `POST /api/v1/purchase-order/photos` | purchase-order ADD or EDIT + CSRF (`x-gms-csrf`) | raw body `image/jpeg \| image/png`, ≤ 5 MB, magic bytes match | `201 {photoId}` |
| `GET /api/v1/purchase-order/photos/:id` | purchase-order VIEW | — | image bytes, `cache-control: private, max-age=31536000, immutable` |

Rules:

- `source: "STOCK"` or any `memoStockId` → `VALIDATION_ERROR lines.N.source` (Q-PO-05).
- Update and delete only while `PENDING_APPROVAL`; update replaces lines, charges and line photos in one transaction.
- `from` / `to` are `YYYY-MM-DD`, `from ≤ to`, range ≤ 366 days, on the Doc Date.
- Decimal values are strings; weight 3 dp, money 2 dp, half-up.

Errors: `VALIDATION_ERROR` 400 (field paths), `PURCHASE_ORDER_NOT_FOUND` 404, `PURCHASE_ORDER_CHANGED` 409, `PURCHASE_ORDER_STATUS_INVALID` 409, `PURCHASE_ORDER_REFERENCE_INVALID` 422 (vendorId, addressId, currency, lines.N.stoneCodeId), `PURCHASE_ORDER_PHOTO_INVALID` 422, `PARTNER_UNAVAILABLE` 503 (photo limiter), `PERMISSION_DENIED`, `UNAUTHORIZED`, `CSRF_INVALID`, `AUTHORIZATION_UNAVAILABLE` 503.

Compatibility: new procedures and routes only. `currency.options` also readable with `purchase-order:VIEW`. Document Setup `used` counts purchase orders.
