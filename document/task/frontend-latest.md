# Latest frontend TODO

- feature-id: `memo-out`
- revision: 2 (UI rev 2 + SA rev 2)
- status: **implemented** 2026-10-31, approved the same day (owner 2026-10-31: "อนุมัติ memo-out revision 2"): From Stock (Memo Stock) on Memo Out, cut into Reserve at Approve; manual rows cut nothing. Backend first, then frontend.
- todo: [todo/memo-out.md](todo/memo-out.md)
- source: owner text 2026-10-31 and answers Q-MO-09…12 ([open questions](../apps/frontend/memo-out/open-questions.md))
- backend-bundles: [SA rev 2](../apps/backend/master/memo-out/decisions.md) + [ADR-0033 rev 2](../adr/0033-memo-documents-in-master-service.md) (Accepted)
- dependencies: none new
- updated-at: 2026-10-31

The previous pointer was `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

