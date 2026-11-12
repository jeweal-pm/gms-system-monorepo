# Open questions: notifications revision 1

| ID | Question | Default (used if the owner accepts the defaults) | Status |
|---|---|---|---|
| Q-NT-01 | Bell badge: a red dot (as in the design's top bar) or a number? | Red dot; the number is in the "For me" tab and in the bell's accessible name | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-02 | What does the **All** tab show? | Every notification event of document types the user may VIEW (activity), read-only, no unread marks; **For me** = addressed to the user, with read state | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-03 | Row click vs. the chevron ("Open list page") | Row → opens the document and marks it read; chevron → opens that document type's list (Approve › {type} for approval events, else the document daybook) | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-04 | The design's "Security Update: Token Management" rows: are system announcements needed now? | No — placeholder text; revision 1 has document events only | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-05 | Show a toast when a new notification arrives? | No (only the bell dot / count update) | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-06 | Which events in revision 1? | Pending approval → approvers; Approved → creator; Rejected / Sent back → creator once ADR-0046 phase 2 is built | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-07 | Retention | 90 days, then deleted by a daily bounded cleanup | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-08 | Should the user who caused the event also get it? | No (never notify the actor) | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
| Q-NT-09 | Approval turned off for a type (Setup › Approval) | No "waits for your approval" notifications for that type (nothing is pending) | **Answered** 2026-11-11 (owner "อนุมัติ"): default |
