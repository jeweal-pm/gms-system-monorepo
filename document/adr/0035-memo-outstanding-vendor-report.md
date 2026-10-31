# ADR-0035: Memo Outstanding (From Vendor) report and Memo Stock buckets

- Status: Accepted (2026-10-29)
- Date: 2026-10-29
- Feature / source UI revision: `memo-outstanding-vendor` / 1
- SA revision: 1 ([decisions](../apps/backend/master/memo-outstanding-vendor/decisions.md))
- Deciders: project owner
- Approval evidence: Owner 2026-10-29: "อนุมัติ memo-outstanding-vendor revision 1" (covers this ADR, SA rev 1, ui-spec rev 1, TODO rev 1, answers Q-MOV-01…09). Owner request 2026-10-29 (verbatim in the [ui-spec](../apps/frontend/memo-outstanding-vendor/ui-spec.md)).
- Related: [ADR-0034](0034-memo-receive-approval-and-memo-stock.md) (Memo Receive and Memo Stock), [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0031](0031-private-master-authorization-boundary.md)

## Context

The owner wants a read-only "Memo Outstanding › From Vendor" page. For each approved Memo Receive and each of its items it shows how much came in (Memo), where it went (Return, Sold, Reserve) and how much is left (Outstanding). The design's own figures follow Outstanding = Memo − Return − Sold − Reserve. Today `memo_stock` only has received and pending quantities. Memo Return, Sale and Reserve don't exist yet. When they do, they reduce pending at approval (Q-MR-15).

## Decision

1. **Read-only report in `backend-api-master`.** A new tRPC router `memoOutstanding` with `vendorSummary`, `vendorList` (offset pages ≤ 50, sort whitelist), `vendorItems` (≤ 25 documents) and `vendorOptions`, all gated by the existing leaf `memo-outstanding-vendor:VIEW`.
2. **Bucket counters on `memo_stock`.** Add `returned_*`, `sold_*` and `reserved_*` (pcs and weight), default 0, with a CHECK that `pending = received − returned − sold − reserved`. Each later approval moves quantity from pending into its bucket in one guarded UPDATE. The report reads the buckets directly, with no history scan. In revision 1 every bucket is 0, so Outstanding = Memo.
3. **Open value** = value of Reserve + Outstanding, using the line amount after the line discount, in the document currency. The grand total is converted to the company currency with each document's exchange rate (Q-MOV-05).
4. **Frontend page** `/memo/memo-outstanding/vendor` as in the ui-spec:
   - KPIs; search, vendor and date filters; expandable item rows; Collapsed or Expanded subtasks; Customize view (kept per browser); selection with Print.
   - Excel export is unavailable in this revision.

Diagrams: [main flow](../diagram/memo-outstanding-vendor-flow.md), [sequence](../apps/backend/master/memo-outstanding-vendor/sequence-diagram.md), [database](../apps/backend/master/memo-outstanding-vendor/database-diagram.md). No new dependency.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Movement/ledger table and derived buckets | It suits the future inventory service (ADR-0027). For this interim memo stock it is heavier, and the report would aggregate history on each read. Counters with a balance CHECK are simpler and remain correct under guarded updates. |
| Compute zeros in the API now and add columns later | The contract would change shape when the writers arrive. Adding the columns now is cheap (small table, no backfill risk). |
| Keyset paging | The design has a numbered pager with a total. Offset is acceptable for thousands of rows; it will be revisited if measurements miss the target. |

## Consequences and capacity

- One additive migration. Rollback drops the columns while no writer uses them.
- No new container, cache or package. Queries are bounded: list ≤ 50, items ≤ 5,000 rows, options ≤ 1,000. Each uses 1–2 queries on a partial open-items index. Targets are list p95 < 150 ms and summary < 100 ms at 50k items, to be measured.
- Memo Return, Sale/Purchase and Reserve/Memo Out revisions must update both pending and their bucket in the same statement (Q-MOV-04 decides which document feeds which bucket).

## Acceptance and approval

- The page shows approved Memo Receive documents with open items, KPIs, filters, expand, customize and print, matching the design, with Return, Sold and Reserve at 0 today.
- Bucket CHECKs hold. Every procedure needs VIEW, and the bounds are enforced.
- Covers this ADR and:
  - [ui-spec rev 1](../apps/frontend/memo-outstanding-vendor/ui-spec.md) and [open questions Q-MOV-01…09](../apps/frontend/memo-outstanding-vendor/open-questions.md)
  - [SA bundle rev 1](../apps/backend/master/memo-outstanding-vendor/decisions.md)
  - [main flow](../diagram/memo-outstanding-vendor-flow.md)
  - [TODO rev 1](../task/todo/memo-outstanding-vendor.md)

  No packages.
