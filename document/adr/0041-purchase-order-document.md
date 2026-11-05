# ADR-0041: Purchase Order document in the master service

- Status: Accepted
- Date: 2026-11-04
- Feature / source UI revision: `purchase-order` / 1
- SA revision: 1
- Deciders: project owner
- Approval evidence: owner 2026-11-04: "อนุมัติ purchase-order revision 1"
- Supersedes / related ADRs: [ADR-0032](0032-quotation-backend-in-master-service.md), [ADR-0033](0033-memo-documents-in-master-service.md), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md)

## Context

The owner asked (2026-11-04; party = vendor, Location kept, photos ≤ 5, approved POs read-only — answers the same day) for a Purchase Order page that looks like Quotation, has an Approve step, and whose approval "sends the items to be bought on the Purchase page". Rows must be keyed in; a PO can't take items from From Stock or Memo Stock. The design is not finished. The menu leaf, permission leaf and Document Setup key `purchase-order` already exist. Bundle: [UI rev 1](../apps/frontend/purchase-order/ui-spec.md), [SA rev 1](../apps/backend/master/purchase-order/decisions.md), [TODO](../task/todo/purchase-order.md).

## Decision

1. Store POs in `backend-api-master`, schema `partner`, tables `purchase_order`, `purchase_order_line`, `purchase_order_charge`, `purchase_order_line_photo`, using the shared `TradeDocumentEngine` with the vendor party adapter (as Memo Receive).
2. Status `PENDING_APPROVAL` on save → `APPROVED` by `purchaseOrder.approve` on the page itself; approved POs are read-only. No reject / cancel / un-approve yet.
3. Approval writes no stock. Each line carries `purchased_pcs` / `purchased_weight_ct` (0 at approve); a line of an approved PO with purchased < ordered is "waiting to be purchased". The future Purchase service is the only writer of those columns.
4. Lines are MANUAL only; the server rejects `STOCK` / `memoStockId`. A PO line has a free-text Location (owner 2026-11-04) and no Stock ID.
5. Photos reuse the Quotation photo code and the shared limiter, behind a new nginx location `/api/v1/purchase-order/photos`.
6. The frontend reuses the Quotation item table and row panel through a `PURCHASE_ORDER_KIND` and the shared vendor header, at route `/purchase/purchase-order`.

## Alternatives

- **Create Memo Stock / inventory rows at approve** (like Memo Receive): rejected — goods are not received yet; stock is created by Purchase.
- **A separate "purchase request" table filled at approve:** duplicates every line; outstanding columns on the line are enough and match Memo Out (`returned_*`).
- **Reuse the Quotation tables with a type column:** mixes customer and vendor documents and their permissions.

## Consequences and capacity

- Additive migration; rollback drops the four tables. No auth migration (catalog leaf exists). Document Setup `used` also counts purchase orders.
- One nginx location is added (integration-owned file). No new container, image, volume, cache or package.
- A save is one transaction of ≤ 200 lines; approve is a single-row update; lists are keyset ≤ 50. Photo traffic shares the existing 3/6 limiter, so memory and pool use on the 4 GB / 2 vCPU host are unchanged.

## Acceptance and approval

- UT-PO-01…04, UT-PO-B01, GP-MT-PO, IT-PO-01…03 pass; TC-PO-01 in the browser.
- Covers: the UI rev 1 bundle, SA rev 1 bundle, flow diagram and this ADR. Accepted 2026-11-04.
