# Latest frontend TODO

- feature-id: `memo-out-return`
- revision: 4 (UI rev 4 + SA rev 2)
- status: **implemented, security review pending** — approved 2026-10-31 (Owner 2026-10-31: "อนุมัติ memo-out-return revision 4"), in progress: customer party, Memo Outstanding picker from approved Memo Out lines, Approve brings stock lines back from Reserve to Memo Stock pending. Questions Q-MOR-11…18 use proposed defaults.
- todo: [todo/memo-out-return.md](todo/memo-out-return.md)
- source: owner text 2026-10-31 ([ui-spec rev 4](../apps/frontend/memo-out-return/ui-spec.md))
- backend-bundles: [SA rev 2](../apps/backend/master/memo-out-return/decisions.md) + [ADR-0033 rev 3](../adr/0033-memo-documents-in-master-service.md) (Accepted)
- dependencies: none new
- updated-at: 2026-10-31

The previous pointer was `memo-out` revision 2 ([todo/memo-out.md](todo/memo-out.md), implemented 2026-10-31); before that `memo-outstanding-vendor` revision 1 ([todo/memo-outstanding-vendor.md](todo/memo-outstanding-vendor.md), approved 2026-10-29); before that `memo-return` revision 1 ([todo/memo-return.md](todo/memo-return.md)), `memo-out-return` revision 3 ([todo/memo-out-return.md](todo/memo-out-return.md)); before that `memo-receive` revision 2, `memo-out` revision 1, `decimal-setup` revision 1, `currency` revision 1, `document-setup` revision 1, `stone-master` revision 1, `company-profile` revision 3, `company-profile` revision 2, `app-navigation` revision 3, `vendor` revision 2 and `customer` revision 1. (The 2026-10-29 merge of PR #56 had emptied this pointer and dropped the memo rows from the index; restored here.)

Read the linked TODO for the authoritative status; see [the delivery workflow](../workflow/ui-delivery.md).

