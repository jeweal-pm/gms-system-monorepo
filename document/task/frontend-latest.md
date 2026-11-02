# Latest frontend TODO

- feature-id: `app-shell-tabs`
- revision: 1
- status: **approved** 2026-11-02 (owner "อนุมัติ app-shell-tabs revision 1"), frontend implemented 2026-11-02: browser-like tabs in the App Shell; switching keeps typed data (pages kept alive); close one / close all; limit 15; reopen after reload.
- todo: [todo/app-shell-tabs.md](todo/app-shell-tabs.md)
- source: owner design 2026-11-02 ([apps/frontend/app-shell-tabs/source/](../apps/frontend/app-shell-tabs/source/)) and answers Q-TAB-01…04
- backend-bundles: none (frontend only); [ADR-0037](../adr/0037-app-shell-tabs.md) (Accepted)
- dependencies: none new
- updated-at: 2026-11-02

The previous pointer was `reserve` revision 1 ([todo/reserve.md](todo/reserve.md), implemented 2026-11-02); before that `memo-out-return` revision 4 ([todo/memo-out-return.md](todo/memo-out-return.md), implemented 2026-10-31, security review pending; merged with this pointer 2026-11-02); before that `memo-out` revision 2 ([todo/memo-out.md](todo/memo-out.md), implemented 2026-10-31); before that `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

