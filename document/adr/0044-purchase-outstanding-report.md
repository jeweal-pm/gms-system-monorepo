# ADR-0044: Purchase Outstanding report on Memo Stock

- Status: Accepted
- Date: 2026-11-06
- Feature / source UI revision: `purchase-outstanding` / 1
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner 2026-11-06 (design + formula): "ทำหน้า purchase outstanding มาโดยสูตรbalance คือ memo - return - purchase ส่วน sale คือ รอย้ายมา purchase (1) ไม่ต้องสนใจ เป็น 1 ธรรมาดา"
- Related: [ADR-0035](0035-memo-outstanding-vendor-report.md), [ADR-0039](0039-memo-outstanding-customer-report.md), [ADR-0042](0042-purchase-document-and-stock-deduction.md), [ADR-0043](0043-purchase-merged-memo-stock-line.md)

## Context

The owner needs to see, per vendor memo (Memo Receive), how much is still owed to the vendor: what came in on memo, minus what went back and what was bought. Stones sold to customers are owed until a Purchase buys them. Purchase (ADR-0042/0043) now writes `memo_stock.purchased`. Bundle: [ui-spec](../apps/frontend/purchase-outstanding/ui-spec.md), [SA](../apps/backend/master/purchase-outstanding/decisions.md), [TODO](../task/todo/purchase-outstanding.md).

## Decision

1. A read-only report in `backend-api-master` (`purchaseOutstanding.summary/list/items/options`, `purchase-outstanding:VIEW`) over approved Memo Receives and their Memo Stock items, with Memo = received, Return = returned, Purchase = purchased, Sale = sold − purchased, Balance = received − returned − purchased.
2. The frontend reuses the shared Memo Outstanding report components (as From Customer did), with per-report column labels (Purchase / Sale / Balance Outstanding), at `/purchase-order/purchase-outstanding`.

## Alternatives

- Extending From Vendor with two more columns: mixes two owners' questions on one page and permission.
- A Purchase-Order-based view (ordered − purchased): a different question; possible later.

## Consequences and capacity

No migration or index; queries match From Vendor (bounded pages, ≤ 25 ids for items). The shared report gains optional per-report labels; From Vendor and From Customer render as before.

## Acceptance

Backend router and DB tests for the formulas, filters, sort and grants; frontend tests for the route, labels and mapping; both security reviews on the final code.
