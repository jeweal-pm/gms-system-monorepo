# Latest frontend TODO

- feature-id: `purchase-order`
- revision: UI 1 + SA 1 (TODO revision 1)
- status: **approved** 2026-11-04 (owner 2026-11-04: "อนุมัติ purchase-order revision 1"), in progress — Purchase Order page like Quotation, vendor party, keyed-in rows only (no From Stock / Memo Stock), Save → Pending Approval → Approve on the page; approve sends the items to Purchase (waiting to be purchased, no stock written). Defaults Q-PO-01…13.
- todo: [todo/purchase-order.md](todo/purchase-order.md)
- source: owner text 2026-11-04 (no Figma yet; Quotation layout)
- backend-bundles: [apps/backend/master/purchase-order/](../apps/backend/master/purchase-order/), [ADR-0041](../adr/0041-purchase-order-document.md) (Accepted)
- dependencies: none new
- updated-at: 2026-11-04

The previous pointer was `decimal-setup` revision 2 ([todo/decimal-setup.md](todo/decimal-setup.md), implemented 2026-11-03); before that `memo-outstanding-customer` revision 1 ([todo/memo-outstanding-customer.md](todo/memo-outstanding-customer.md), implemented 2026-11-03; merged with this pointer 2026-11-03); before that `quotation` revision 2 ([todo/quotation.md](todo/quotation.md), implemented 2026-11-03); before that `app-shell-tabs` revision 1 ([todo/app-shell-tabs.md](todo/app-shell-tabs.md), approved and implemented 2026-11-02); before that `reserve` revision 1 ([todo/reserve.md](todo/reserve.md), implemented 2026-11-02); before that `memo-out-return` revision 4 ([todo/memo-out-return.md](todo/memo-out-return.md), implemented 2026-10-31, security review pending; merged with this pointer 2026-11-02); before that `memo-out` revision 2 ([todo/memo-out.md](todo/memo-out.md), implemented 2026-10-31); before that `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

