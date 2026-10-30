# API contract: memo-receive + memo stock (SA revision 1, 2026-10-29, approved 2026-10-29)

Typed tRPC routers `memoReceive` and `memoStock` on the master router (`/api/master/trpc`). Types reuse the [memo-out contract](../memo-out/api-contract.md) and the [quotation contract](../quotation/api-contract.md). Consumers: TODO [memo-receive.md](../../../../task/todo/memo-receive.md) FE-MR-007…010; `memoStock.list` is also for the future Memo Return page.

```ts
type MemoReceiveStatus = "PENDING_APPROVAL" | "APPROVED";              // SA-MR-03

// Stone Code and location are not inputs (rev 2 / SA-MR-07). `id` identifies a saved line so it keeps its Stock ID.
type MemoReceiveLineInput = Omit<QuotationLineInput, "stoneCodeId" | "location"> & { id?: string; photoIds: [] };
type MemoReceiveInput = Omit<MemoOutReturnInput, "lines"> & { lines: MemoReceiveLineInput[] }; // vendorId + addressId, header, discount, tax, charges, labor

type MemoReceiveLine = MemoReceiveLineInput & { id: string; stockId: string; discountAmount: string; amount: string };  // stockId e.g. "260001"
type MemoReceive = MemoReceiveInput & {
  id: string; docNo: string; status: MemoReceiveStatus; version: number;
  vendor: { code: string; name: string }; addressText: string; lines: MemoReceiveLine[]; totals: Totals;
  approvedAt: string | null; approvedBy: string | null; createdAt: string; createdBy: string; updatedAt: string;
};

type MemoStockRow = {
  id: string; stockId: string; lot: string; location: "Memo"; itemNote: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string;
  receivedPcs: number; receivedWeightCt: string; pendingPcs: number; pendingWeightCt: string;
  priceUnit: "CTS" | "PCS"; unitPrice: string;          // gross Memo Price of the line
  netUnitPrice: string;                                  // after the line discount (Q-MR-13), shown as PRICE
  currency: string; amount: string;                      // lineAmount × pending basis ÷ received basis
  vendor: { id: string; code: string; name: string };
  memoReceive: { id: string; docNo: string; docDate: string; dueDate: string };
};
```

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `memoReceive.list` | memo-receive VIEW | `{q?, partyId?, status?, from?, to?, cursor?, limit? ≤ 50}` | `{items: {id, docNo, status, docDate, dueDate, vendorName, currency, grandTotal, updatedAt}[], nextCursor, total}` |
| `memoReceive.get` | memo-receive VIEW | `{id}` | `MemoReceive` |
| `memoReceive.nextNumber` | memo-receive VIEW | `{docDate}` | `{docNo}` |
| `memoReceive.options` | memo-receive VIEW | `{vendorId?}` | `memoOutReturn.options` shape; `stone` without codes |
| `memoReceive.create` | memo-receive ADD + CSRF | `MemoReceiveInput` (no line `id`) | `{id, docNo, version, stockIds: string[]}` (by line position) |
| `memoReceive.update` | memo-receive EDIT + CSRF | `{id, expectedVersion} & MemoReceiveInput` | `{id, version, stockIds: string[]}` |
| `memoReceive.delete` | memo-receive DELETE + CSRF | `{id, expectedVersion}` | `{ok: true}` |
| `memoReceive.approve` | memo-receive APPROVE + CSRF | `{id, expectedVersion}` | `{id, version, status: "APPROVED", memoStockCount}` |
| `memoStock.list` | memo-return VIEW **or** memo-receive VIEW | `{vendorId, q? ≤ 100, from?, to?, cursor?, limit? ≤ 50}` | `{items: MemoStockRow[], nextCursor}` |

Rules:

- A line `id` on update must belong to this document; otherwise `VALIDATION_ERROR lines.N.id "unknown_line"`. Lines without `id` get new Stock IDs; saved lines not sent are removed (numbers not reused).
- Stock ID year = year of the save (Q-MR-08), e.g. a line added on 2027-01-05 to a 2026 document gets `27….`.
- `from`/`to` are `YYYY-MM-DD`, `from ≤ to`, range ≤ 366 days; filter the memo receive Doc Date (Q-MR-10).
- `cursor` is opaque (base64url of `receivedDocDate|stockId`).
- Decimal values are strings; weight 3 dp, money 2 dp, half-up.

Errors: `VALIDATION_ERROR` (400, field paths), `MEMO_RECEIVE_NOT_FOUND` 404, `MEMO_RECEIVE_CHANGED` 409, `MEMO_RECEIVE_STATUS_INVALID` 409, `MEMO_RECEIVE_REFERENCE_INVALID` 422 (field named: vendorId, addressId, currency), `MEMO_RECEIVE_STOCK_ID_EXHAUSTED` 409, `PERMISSION_DENIED`, `UNAUTHORIZED`, `CSRF_INVALID`, `AUTHORIZATION_UNAVAILABLE` 503. Details: [error-handling](error-handling.md).

Compatibility: new procedures only; Memo Out / Memo Out Return contracts unchanged (engine status config defaults to `DRAFT`). `currency.options` also readable with `memo-receive:VIEW`.

## SA revision 2 (2026-10-29, approved): line photos

```ts
type MemoReceiveLineInput = Omit<QuotationLineInput, "stoneCodeId" | "location"> & { id?: string; photoIds: string[] }; // ≤ 5, distinct
// MemoReceive detail lines return photoIds: string[] in order.
```

| Route | Grant | Input | Output |
|---|---|---|---|
| `POST /api/v1/memo-receive/photos` | memo-receive ADD or EDIT + CSRF (`x-gms-csrf`) | raw body, `content-type: image/jpeg \| image/png`, ≤ 5 MB, magic bytes match | `201 {photoId}` |
| `GET /api/v1/memo-receive/photos/:id` | memo-receive VIEW | — | image bytes, `cache-control: private, max-age=31536000, immutable` |

New errors:
- `MEMO_RECEIVE_PHOTO_INVALID` (422): wrong type, size or magic bytes, or an unknown or foreign photo id on save.
- `MEMO_RECEIVE_NOT_FOUND` (404): unknown photo on GET.
- `PARTNER_UNAVAILABLE` (503, `retry-after: 1`): the shared limiter is full. This is the same code Quotation returns (corrected 2026-10-29: the first text said `PHOTO_BUSY`).
