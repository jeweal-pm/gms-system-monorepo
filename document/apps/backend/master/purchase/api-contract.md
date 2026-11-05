# API contract: purchase (SA revision 1, 2026-11-04, approved 2026-11-04)

Typed tRPC router `purchase` on the master router (`/api/master/trpc`, same-origin proxy → nginx → `api-master:3201`). Types reuse the [purchase-order contract](../purchase-order/api-contract.md), the [memo-receive contract](../memo-receive/api-contract.md) and the [quotation contract](../quotation/api-contract.md). Consumer: TODO [purchase.md](../../../../task/todo/purchase.md) FE-PU-003 (document), FE-PU-004 (both pickers) and FE-PU-005 (manual rows and confirm texts). Decisions: [decisions.md](decisions.md).

## Document

```ts
type PurchaseStatus = "PENDING_APPROVAL" | "APPROVED";                       // SA-PU-09
type PurchaseLineSource = "STOCK" | "PURCHASE_ORDER" | "MANUAL";              // SA-PU-03 (STOCK = Memo Stock, as quotation / memo out)
type MemoGroup = "IN_STOCK" | "SOLD";                                         // SA-PU-05/12

// Every line sends the shared quotation line fields (lineInputSchema) so the form maps 1:1.
// For STOCK and PURCHASE_ORDER lines the server REPLACES stoneCodeId, stoneCode, stone, shape, size, color, clarity,
// cutting, quality, lot, location, cerType, cerNo and priceUnit from the database (SA-PU-14); only pcs, weightCt,
// unitPrice and itemNote are taken from the input, and discount must be {type: "NONE"} (R2-03 / R2-D-07, D8).
type PurchaseLineInput = Omit<QuotationLineInput, "source" | "photoIds"> & {
  id?: string;                         // update only: a saved line id keeps its issued Stock ID (MANUAL / PURCHASE_ORDER)
  source: PurchaseLineSource;
  memoStockId?: string | null;         // STOCK: required; otherwise null/absent
  memoGroup?: MemoGroup | null;        // STOCK: required; otherwise null/absent
  purchaseOrderLineId?: string | null; // PURCHASE_ORDER: required; otherwise null/absent
  photoIds: [];                        // Q-PU-11: no photos in rev 1 (max 0)
};
type PurchaseInput = Omit<PurchaseOrderInput, "lines"> & { lines: PurchaseLineInput[] }; // vendorId + addressId, docDate, dueDate,
                                                                                          // currency, exchangeRate, ref, documentNote,
                                                                                          // discount, tax, serviceCharges, labor; lines 1..200

type PurchaseLine = Omit<PurchaseLineInput, "id" | "photoIds"> & {
  id: string; stockId: string;                        // STOCK: the item's; MANUAL / PURCHASE_ORDER: issued at save (SA-PU-10)
  photoIds: [];
  discountAmount: string; amount: string;
  memoReceive: { docNo: string } | null;              // STOCK only (the item's Memo No.)
  purchaseOrder: { id: string; docNo: string; position: number } | null; // PURCHASE_ORDER only
  limitPcs: number | null; limitWeightCt: string | null; // PENDING_APPROVAL source lines: current availability (SA-PU-16)
};
type Purchase = Omit<PurchaseInput, "lines"> & {
  id: string; docNo: string; status: PurchaseStatus; version: number;
  vendor: { code: string; name: string }; addressText: string; lines: PurchaseLine[]; totals: Totals;
  approvedAt: string | null; approvedBy: string | null; createdAt: string; createdBy: string; updatedAt: string;
};
```

| Procedure | Kind | Permission | Input | Output |
|---|---|---|---|---|
| `purchase.list` | query | purchase VIEW | `{q?, partyId?, status?, from?, to?, cursor?, limit? ≤ 50}` | `{items: {id, docNo, status, docDate, dueDate, vendorName, currency, grandTotal, updatedAt}[], nextCursor, total}` |
| `purchase.get` | query | purchase VIEW | `{id}` | `Purchase` |
| `purchase.nextNumber` | query | purchase VIEW | `{docDate}` | `{docNo}` (preview; Document Setup key `purchase`) |
| `purchase.options` | query | purchase VIEW | `{vendorId?}` | `purchaseOrder.options` shape: vendors + addresses, currencies, company currency, charge types, stone lists with codes, `numbering: {configured}` |
| `purchase.memoStock` | query | purchase VIEW | see [Memo Stock picker](#memo-stock-picker) | `{items, nextCursor, counts}` |
| `purchase.purchaseOrderLines` | query | purchase VIEW | see [Purchase Order picker](#purchase-order-picker) | `{items, nextCursor}` |
| `purchase.create` | mutation | purchase ADD + CSRF | `PurchaseInput` | `{id, docNo, version, stockIds: string[]}` (Stock ID per line, in order) |
| `purchase.update` | mutation | purchase EDIT + CSRF | `{id, expectedVersion} & PurchaseInput` | `{id, version, stockIds: string[]}` |
| `purchase.delete` | mutation | purchase DELETE + CSRF | `{id, expectedVersion}` | `{ok: true}` |
| `purchase.approve` | mutation | purchase APPROVE + CSRF | `{id, expectedVersion}` | `{id, version, status: "APPROVED", lineCount}` |
| `currency.options` (existing) | query | any of …, **+ purchase** VIEW | — | unchanged |

### Input rules (strict zod; the server re-checks everything)

- Unknown keys are refused (`.strict()`). `create` refuses `lines.N.id`, as Memo Receive does. On `update`, line ids must be distinct.
- `source: "STOCK"` needs `memoStockId` and `memoGroup`, with `purchaseOrderLineId` absent or null. `source: "PURCHASE_ORDER"` needs `purchaseOrderLineId`, with the other two absent or null. `source: "MANUAL"` must have all three absent or null. A violation gives `VALIDATION_ERROR lines.N.<field>` with code `required` or `not_allowed`.
- Duplicates: a `(memoStockId, memoGroup)` pair at most once, and a `purchaseOrderLineId` at most once. A repeat gives `VALIDATION_ERROR lines.N.memoStockId|purchaseOrderLineId` / `duplicate`.
- Every line: pcs 0–999,999 with weight 0–99,999.999 (3 dp), and pcs > 0 or weight > 0 (`lines.N.pcs` / `required`). Unit price > 0 with 2 dp (`lines.N.unitPrice` / `required`). Item note ≤ 500. STOCK and PURCHASE_ORDER lines need `discount.type = "NONE"` (`lines.N.discount` / `not_allowed`). MANUAL lines may have a line discount within the SA-MR-09 bounds.
- MANUAL: the quotation MANUAL bounds (attributes ≤ 60, lot ≤ 40, location ≤ 40, cer type ≤ 20, cer no ≤ 60). `stoneCodeId` must be an active stone code or one already stored on the document.
- Header: the purchase-order rules (SA-PO-07). `from` / `to` are `YYYY-MM-DD`, with `from ≤ to` and a range of ≤ 366 days. Decimals travel as strings: weight 3 dp, money 2 dp, half-up.

### Stock rule: check at Save, cut at Approve (SA-PU-04…09, SA default D2)

| Line | create / update / delete | approve (one transaction, `FOR UPDATE` in id order) | Guard at approve |
|---|---|---|---|
| STOCK `IN_STOCK` | No stock change. q ≤ pending now, otherwise `VALIDATION_ERROR` `exceeds_available` | `memo_stock`: pending −= q, sold += q, purchased += q | q ≤ pending |
| STOCK `SOLD` | No stock change. q ≤ sold − purchased now | `memo_stock`: purchased += q | q ≤ sold − purchased |
| PURCHASE_ORDER | No stock change. q ≤ ordered − purchased now, and the PO is APPROVED with the same vendor and currency | `purchase_order_line`: purchased_pcs / purchased_weight_ct += q | q ≤ ordered − purchased |
| MANUAL | nothing | nothing | — |

Lines are summed per key before the guard. A short at approve → `PURCHASE_PENDING_SHORT` with the field of every short line. The purchase stays `PENDING_APPROVAL` and nothing changes.

## Memo Stock picker

The "Add Memo Stock" dialog (UI revision 2): two groups, tabs All / Sold / In stock with counts, search, and a date range.

```ts
type PurchaseMemoStockInput = {
  vendorId: string; currency: string;            // required (Q-PU-15)
  status?: "ALL" | MemoGroup;                    // default ALL (R2-D-03 status filter)
  q?: string;                                    // ≤ 100, trimmed; Stock ID, lot, stone, cer no, memo no (invoice: no data in rev 1)
  from?: string; to?: string;                    // Memo Receive Doc Date, ≤ 366 days (D13)
  cursor?: string | null; direction?: "forward" | "backward"; limit?: number; // ≤ 50, default 50
};
type PurchaseMemoStockRow = {
  key: string;                                   // `${memoStockId}:${status}` (unique row key)
  memoStockId: string; status: MemoGroup;        // SOLD rows first, then IN_STOCK; send it back as memoGroup
  stockId: string; lot: string; itemNote: string;
  memoReceive: { id: string; docNo: string; docDate: string; dueDate: string }; // "Memo No." and "with us since memo" = docDate
  ref: { type: "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string; docDate: string }; // From Stock Ref. (additive 2026-11-05); today = memoReceive, LOAD reserved
  location: string;                              // "Memo"
  locationType: null;                            // Pair / Parcel / Single: no field exists (D6)
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string;
  availablePcs: number; availableWeightCt: string; // SOLD: sold − purchased; IN_STOCK: pending
  priceUnit: "CTS" | "PCS"; unitPrice: string; netUnitPrice: string;           // as memoStock.list
  amount: string;                                // line amount × available basis ÷ received basis, 2 dp half-up
  sale: { invoiceNo: string; invoiceDate: string; customerName: string } | null; // always null in rev 1 (no Sale entity)
};
type PurchaseMemoStockOutput = { items: PurchaseMemoStockRow[]; nextCursor: string | null; counts: { all: number; sold: number; inStock: number } };
```

- The order is status (SOLD, then IN_STOCK), then Memo Receive Doc Date desc, then Stock ID desc. The opaque keyset cursor is base64url of `g|YYYY-MM-DD|stockId` (g = 0 for SOLD, 1 for IN_STOCK), strictly decoded. A bad cursor → `VALIDATION_ERROR cursor`.
- `counts` use the same vendor, currency, q and date filters, ignore `status` and `cursor`, and come from one `count(*) FILTER (…)` query.
- Only the vendor's items in this currency. Reserved quantity is never listed (D5). A pending purchase holds nothing, so the frontend leaves out rows that are already on the form (by `key`). A row's maximum is its `available*`.
- **What is empty in revision 1 (D6):** the SOLD group (the Sold tab count is 0), `sale`, `locationType`, and search hits on an invoice no. Everything else has data: Stock ID, Lot · Memo No., note, Location "Memo", Stone (shape · size), Color · Clarity (cutting · quality), Cer Type (cer no), Status (from `status`), Pcs/Weight, Price/Unit and Amount.
- **Ref. (additive, owner 2026-11-04):** `ref` is the source transaction of the stock item, the same `StockSourceRef` as `memoStock.list` ([memo-receive contract](../memo-receive/api-contract.md)). Today always `{type: "MEMO_RECEIVE", id, docNo, docDate}` of the Memo Receive; `LOAD` is reserved for the future Load document (no Load page/table yet). Search is unchanged (it already matches the memo no.). See [changelog](../../../../changelog/2026-11-05-stock-source-ref.md).

## Purchase Order picker

```ts
type PurchaseOrderLinesInput = {
  vendorId: string; currency: string;
  q?: string;                                    // ≤ 100; PO no, stone, lot, cer no
  from?: string; to?: string;                    // PO Doc Date, ≤ 366 days
  status?: "ALL" | "OPEN" | "PARTLY_PURCHASED";  // default ALL (Q-PU-20 tabs)
  cursor?: string | null; direction?: "forward" | "backward"; limit?: number; // ≤ 50
};
type PurchaseOrderLineRow = {
  purchaseOrderLineId: string;
  status: "OPEN" | "PARTLY_PURCHASED";           // OPEN = purchased pcs and weight both 0
  purchaseOrder: { id: string; docNo: string; docDate: string; dueDate: string; ref: string }; position: number; // group row header
  stoneCodeId: string | null; stoneCode: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  lot: string; location: string; cerType: string; cerNo: string; itemNote: string;
  orderedPcs: number; orderedWeightCt: string; purchasedPcs: number; purchasedWeightCt: string;
  availablePcs: number; availableWeightCt: string; // ordered − purchased
  priceUnit: "PER_CT" | "PER_PCS"; unitPrice: string;
  netUnitPrice: string;                          // after the PO line discount, 2 dp (starting Price, D12)
  amount: string;                                // PO line amount × available basis ÷ ordered basis, 2 dp
};
// Output: { items: PurchaseOrderLineRow[]; nextCursor: string | null; counts: { all: number; open: number; partlyPurchased: number } }
```

- Only lines of `APPROVED` POs of this vendor in this currency, with available pcs > 0 or weight > 0. The order is PO Doc Date desc, PO created_at desc, PO id desc, then line position asc, so one PO's lines are adjacent for the group rows. The cursor is base64url JSON `{d, c, i, p, v: 1}`, strictly decoded. `counts` use the same filters, ignore `status` and `cursor`, and come from one `count(*) FILTER` query.
- A picked PO row's Stock ID shows "Auto" until the save issues it (SA-PU-10).

## Errors (`error.data.domainCode`, HTTP)

`VALIDATION_ERROR` 400 (fieldErrors), `PURCHASE_NOT_FOUND` 404, `PURCHASE_CHANGED` 409 (stale version, or a number race on save), `PURCHASE_STATUS_INVALID` 409 (not pending), `PURCHASE_REFERENCE_INVALID` 422 (`vendorId`, `addressId`, `currency`, `lines.N.stoneCodeId`, `lines.N.memoStockId`, `lines.N.purchaseOrderLineId`), `PURCHASE_PENDING_SHORT` 409 at approve (`lines.N.pcs|weightCt` / `exceeds_available`; at save the same condition is `VALIDATION_ERROR` `exceeds_available`), `PURCHASE_STOCK_ID_EXHAUSTED` 409, `PARTNER_UNAVAILABLE` 503, `UNAUTHORIZED` 401, `PERMISSION_DENIED` 403, `CSRF_INVALID` 403, `LICENSE_REQUIRED` 403, `AUTHORIZATION_UNAVAILABLE` 503. Full table: [error-handling](error-handling.md).

Note for frontend: the conflict code is `PURCHASE_CHANGED`, not `*_STALE` as the UI rev 1 error-handling draft says. `mapDocumentSaveError(error, "PURCHASE", …)` already maps `_CHANGED`, `_STATUS_INVALID` and `_REFERENCE_INVALID`. `_PENDING_SHORT` is mapped like `MEMO_RETURN_PENDING_SHORT` (a row error).

## Compatibility

- New procedures only. `currency.options` adds `purchase` to its any-of list. `memoStock.list` is unchanged and **not** opened to `purchase:VIEW`, because Purchase uses `purchase.memoStock`.
- `purchaseOrder.get` now shows non-zero `purchasedPcs` / `purchasedWeightCt` (already in its contract).
- Memo Outstanding › Vendor: no contract change. Its Sold figures now include purchases (SA-PU-05).
- Document Setup `used` counts purchases.

## SA revision 2 (proposed 2026-11-05): merged lines

```ts
type MemoGroup = "IN_STOCK" | "SOLD" | "MERGED";                     // SA-PU-21
// PurchaseLineInput: unchanged except memoGroup may be "MERGED" (source "STOCK").
type PurchaseLine = /* rev 1 fields */ & {
  minPcs: number | null; minWeightCt: string | null;                 // pending doc: MERGED = soldOpen, SOLD = soldOpen (= limit)
  soldPartPcs: number | null; soldPartWeightCt: string | null;       // approved MERGED lines: the Sold part taken first
};
```

New field-error codes on Save: `below_sold` (MERGED under the Sold part), `not_mergeable` (the item has no Sold or no In-stock part), `must_equal_sold` (SOLD line not equal to the Sold part); `duplicate` also covers an item sent both as MERGED and as SOLD / IN_STOCK. Approve keeps `PURCHASE_PENDING_SHORT` for a MERGED line that no longer fits (SA-PU-23). `purchase.memoStock` is unchanged.
