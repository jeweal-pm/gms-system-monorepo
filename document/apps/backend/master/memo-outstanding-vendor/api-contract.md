# API contract: memo-outstanding-vendor (SA revision 1, 2026-10-29, approved 2026-10-29)

Read-only tRPC router `memoOutstanding` on the master router (`/api/master/trpc`). Consumers: FE-MOV-001…004 in [the TODO](../../../../task/todo/memo-outstanding-vendor.md).

```ts
type Qty = { pcs: number; weightCt: string };                 // weight 3 dp string
type Buckets = { memo: Qty; return: Qty; sold: Qty; reserve: Qty; outstanding: Qty };
type Filters = { q?: string /* ≤ 100 */; vendorIds?: string[] /* ≤ 50 uuid */; from?: string; to?: string /* YYYY-MM-DD, from ≤ to, ≤ 366 days */ };

type VendorListRow = Buckets & {
  memoReceiveId: string; docNo: string; docDate: string; dueDate: string;
  dueInDays: number;                                          // negative = overdue by N days (Asia/Bangkok today)
  vendor: { id: string; code: string; name: string };
  currency: string; openValue: string;                        // reserve + outstanding value, 2 dp, doc currency
};
type VendorItem = Buckets & {
  id: string; memoReceiveId: string; position: number; stockId: string; lot: string; location: "Memo";
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string; itemNote: string; photoCount: number;
  priceUnit: "CTS" | "PCS"; netUnitPrice: string; currency: string; openValue: string;
};
```

| Procedure | Grant | Input | Output |
|---|---|---|---|
| `memoOutstanding.vendorSummary` | memo-outstanding-vendor VIEW | `Filters` | `{documents, overdue, dueIn7Days, grandTotal: string, companyCurrency: string}` |
| `memoOutstanding.vendorList` | same | `Filters & {page ≥ 1, pageSize: 10 \| 25 \| 50, sort?: SortKey, dir?: "asc" \| "desc"}` | `{items: VendorListRow[], total, page, pageSize}` |
| `memoOutstanding.vendorItems` | same | `{memoReceiveIds: string[] /* 1–25 uuid */}` | `{items: VendorItem[]}` |
| `memoOutstanding.vendorOptions` | same | `{}` | `{vendors: {id, code, name}[]}` (≤ 1,000) |

`SortKey` = `docNo | dueDate | vendorName | memoPcs | returnPcs | soldPcs | reservePcs | outstandingPcs | openValue`. The default is `dueDate asc`.

Errors:
- `VALIDATION_ERROR` (400): fields `to` (`before_from`, `range_too_long`), `vendorIds`, `memoReceiveIds`, `pageSize`, `sort`.
- `PERMISSION_DENIED` (403), `UNAUTHORIZED` (401).
- `AUTHORIZATION_UNAVAILABLE` (503).

An id passed to `vendorItems` that is unknown or not approved is skipped. It is not an error.

Compatibility: new procedures only. `memo_stock` gains bucket columns, while `memoStock.list` and the memo-receive contracts are unchanged.
