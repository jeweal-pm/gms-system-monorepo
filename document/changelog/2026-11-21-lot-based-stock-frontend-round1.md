# 2026-11-21 — Lot-based stock, frontend round 1 (FE-LOT-001, 002, 006, 007 partial)

- Add From Stock for Quotation, Reserve and Memo Out now lists lots (`fromStock.lots`): one row per lot, our stock first (each own item its own row this round), Memo Stock lots after. Columns "Lot / Stone Code", search "Lot, Stone, Stone Code, Cer No., Doc No."; no Stock ID anywhere.
- A picked lot fills the line with its lot, details and pending quantity as the starting cap; Save sends `lotKey` alone.
- Item tables, row panel, Approve Center preview (code column) and its search text on these three documents show the Lot, never a Stock ID. Saved lines show their Lot; "—" when none.
- Save / Approve errors name the row: lot short ("only x pcs / y ct left in lot L"), lot with nothing left, duplicate / not mergeable, too large, own-stock race.
- Not in this round (still Stock ID): Purchase, Memo Return, Sale, Memo Out Return, Memo Receive, Load to Stock, Memo Outstanding. Old item ids are still accepted by the backend for stored lines.
- No package changes. Tests: full frontend suite, typecheck and eslint pass.
