# API contract: memo-outstanding-customer (SA revision 1, approved 2026-11-03)

Read-only procedures on the existing tRPC router `memoOutstanding` (`/api/master/trpc`). Consumers: FE-MOC-001…002 in [the TODO](../../../../task/todo/memo-outstanding-customer.md).

```ts
type Qty = { pcs: number; weightCt: string };                       // weight 3 dp string
type CustomerBuckets = { memo: Qty; return: Qty; sold: Qty; outstanding: Qty };
type CustomerFilters = { q?: string /* ≤ 100 */; customerIds?: string[] /* ≤ 50 uuid */; from?: string; to?: string /* YYYY-MM-DD, from ≤ to, ≤ 366 days */ };

type CustomerListRow = CustomerBuckets & {
  memoOutId: string; docNo: string; docDate: string; dueDate: string;
  dueInDays: number;                                                // negative = overdue by N days (Asia/Bangkok today)
  customer: { id: string; code: string; name: string };
  currency: string; openValue: string;                              // outstanding sale value, 2 dp, doc currency
};
type CustomerItem = CustomerBuckets & {
  id: string /* memo_out_line id */; memoOutId: string; position: number; stockId: string; lot: string; location: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string; itemNote: string;
  priceUnit: "CTS" | "PCS"; netUnitPrice: string /* 4 dp */; currency: string; openValue: string;
};
```

| Procedure | Grant | Input | Output |
|---|---|---|---|
| `memoOutstanding.customerSummary` | memo-outstanding-customer VIEW | `CustomerFilters` | `{documents, overdue, dueIn7Days, grandTotal: string, companyCurrency: string}` |
| `memoOutstanding.customerList` | same | `CustomerFilters & {page ≥ 1, pageSize: 10 \| 25 \| 50, sort?: CustomerSortKey, dir?: "asc" \| "desc"}` | `{items: CustomerListRow[], total, page, pageSize}` |
| `memoOutstanding.customerItems` | same | `{memoOutIds: string[] /* 1–25 uuid */}` | `{items: CustomerItem[]}` |
| `memoOutstanding.customerOptions` | same | `{}` | `{customers: {id, code, name}[]}` (≤ 1,000) |

`CustomerSortKey` is one of `docNo`, `dueDate`, `customerName`, `memoPcs`, `returnPcs`, `soldPcs`, `outstandingPcs` and `openValue`. The default is `dueDate asc`.

Errors:
- `VALIDATION_ERROR` (400) on the fields `to` (`before_from`, `range_too_long`), `customerIds`, `memoOutIds`, `pageSize` and `sort`.
- `PERMISSION_DENIED` (403), `UNAUTHORIZED` (401) and `AUTHORIZATION_UNAVAILABLE` (503).
- Ids passed to `customerItems` that are unknown, not approved or fully returned are skipped, not reported as errors.

Compatibility: these are new procedures only. The vendor procedures and the memo-out contracts are unchanged.
