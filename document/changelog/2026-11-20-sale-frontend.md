# 2026-11-20 — Sale frontend connected (FE-SL-004…010)

- The Sale page now works with the inventory Sale API: customer lists, number preview, Save / Send to approve / Edit / Delete / Restore, Daybook, line photos.
- From Reserve lists the customer's open reserve lines in the sale currency (search, dates, Load more); picked lines start at the open quantity and the reserve price. From Stock lists Memo Stock.
- Sale is in Approve (its own menu with preview, Approve / Revise / Reject), in Setup › Approval (switch from the inventory service) and in the notification bell links.
- The "Not connected yet" placeholders are gone.
- No package changes. Tests: 130 files / 1,150 (1,149 pass; one Approval Setup test fails only because of a separate unfinished page edit).
