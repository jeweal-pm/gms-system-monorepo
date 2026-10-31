# Latest frontend TODO

- feature-id: `memo-return`
- revision: 1
- status: **implemented** 2026-10-29: page + Memo Receive / Memo Return API (FE-MRT-001…003); Memo Receive page on the API (FE-MRT-004) waits for owner decisions
- todo: [todo/memo-return.md](todo/memo-return.md)
- source: owner design 2026-10-29 in [apps/frontend/memo-return/source/](../apps/frontend/memo-return/source/)
- backend-bundles: [SA rev 1](../apps/backend/master/memo-return/decisions.md) + [ADR-0033](../adr/0033-memo-documents-in-master-service.md) implemented
- dependencies: none new
- updated-at: 2026-10-29

The previous pointer was `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

- Latest: [memo-outstanding-vendor](todo/memo-outstanding-vendor.md) revision 1, **approved** 2026-10-29 (backend first, then frontend).
