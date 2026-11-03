# Latest frontend TODO

- feature-id: `decimal-setup`
- revision: UI 2 + SA 1 (TODO revision 2)
- status: **approved** 2026-11-03 (owner; Q-DEC-14 = copy Document Setup grants), in progress — one Decimal Setup for the whole website (no per-page table), real API (`decimalSetup.get` / `save`, `partner.decimal_setup`), new `decimal-setup` permission; defaults Q-DEC-08…18. Backend first, then frontend.
- todo: [todo/decimal-setup.md](todo/decimal-setup.md)
- source: owner text 2026-11-03 ("sa uxui Decimal Setup ให้มันไม่ต้องมี Decimal Places by Page ให้มัน set decimal ทั้ง web เลย frontend backend ทำ ui และ api ด้วย")
- backend-bundles: [apps/backend/master/decimal-setup/](../apps/backend/master/decimal-setup/), [ADR-0038](../adr/0038-global-decimal-setup.md) (Accepted)
- dependencies: none new
- updated-at: 2026-11-03

The previous pointer was `app-shell-tabs` revision 1 ([todo/app-shell-tabs.md](todo/app-shell-tabs.md), approved and implemented 2026-11-02); before that `reserve` revision 1 ([todo/reserve.md](todo/reserve.md), implemented 2026-11-02); before that `memo-out-return` revision 4 ([todo/memo-out-return.md](todo/memo-out-return.md), implemented 2026-10-31, security review pending; merged with this pointer 2026-11-02); before that `memo-out` revision 2 ([todo/memo-out.md](todo/memo-out.md), implemented 2026-10-31); before that `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

