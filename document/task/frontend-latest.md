# Latest frontend TODO

- feature-id: `memo-outstanding-customer`
- revision: 1
- status: **approved** 2026-11-03 (owner "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย"), implemented 2026-11-03 (security review clear; live browser check pending): Memo › Memo Outstanding › From Customer, read-only report of approved Memo Outs.
- todo: [todo/memo-outstanding-customer.md](todo/memo-outstanding-customer.md)
- source: no new design; reuses the From Vendor page; [ui-spec](../apps/frontend/memo-outstanding-customer/ui-spec.md)
- backend-bundles: [SA rev 1](../apps/backend/master/memo-outstanding-customer/decisions.md); [ADR-0039](../adr/0039-memo-outstanding-customer-report.md) (Accepted)
- dependencies: none new
- updated-at: 2026-11-03

The previous pointer was `quotation` revision 2 ([todo/quotation.md](todo/quotation.md), implemented 2026-11-03); before that `app-shell-tabs` revision 1 ([todo/app-shell-tabs.md](todo/app-shell-tabs.md), approved and implemented 2026-11-02); before that `reserve` revision 1 ([todo/reserve.md](todo/reserve.md), implemented 2026-11-02); before that `memo-out-return` revision 4 ([todo/memo-out-return.md](todo/memo-out-return.md), implemented 2026-10-31, security review pending; merged with this pointer 2026-11-02); before that `memo-out` revision 2 ([todo/memo-out.md](todo/memo-out.md), implemented 2026-10-31); before that `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

