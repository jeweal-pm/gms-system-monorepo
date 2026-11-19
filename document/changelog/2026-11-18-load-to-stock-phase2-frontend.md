# 2026-11-18 — Load to Stock phase 2 frontend (own stock in From Stock)

- Quotation, Reserve and Memo Out "Add From Stock" now list Memo Stock and our stock in one list (`fromStock.list`); Location tells the source and our-stock rows show the Load no. If our stock can't be read, Memo Stock rows stay pickable under "Our stock is unavailable — Retry".
- Our-stock rows start at the full available, can be lowered, need a Sale Price, and show "Available x pcs / y ct". Save errors: "More than available" (Quotation), "Row N: only x pcs left" (Reserve / Memo Out), "Our stock can't be checked right now; try again", "Updating our stock; try again in a few seconds".
- Reserve, Memo Out and Memo Out Return show "Updating our stock…" next to the status while inventory is being updated, and refresh every 5 s until done. Memo Outstanding dialog gains a Location column.
- Load to Stock row panel: Info group (Stock ID, Lot up to 40 characters, Location); the in-use note names the documents holding the stock.
- No package changes. Tests: 125 files / 1,116 pass. Live checks wait for running services.
