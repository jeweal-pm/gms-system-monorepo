# 2026-11-18 — Sale frontend shell (UI rev 1, FE-SL-001…003)

- The Purchase picker shell moved to `frontend/src/features/trade-document/stock-picker.tsx` (`StockPicker`), so Sale can reuse it. Purchase looks and works as before.
- New routes `/sale/sale` and `/sale/sale/[id]` with the Sale page shell and form model (`frontend/src/features/sale/**`): From Reserve then From Stock, pick-only rows, quantity caps, Sale Price required, From Reserve rows cleared (after a confirm) when the customer or currency changes.
- Owner 2026-11-18 "UI only, no API yet": Sidebar › Sale › Sale now opens the full Sale page — header, Item card (From Reserve, From Stock), table, row panel, note and Summary Value. The lists are empty, the number shows "SL…", and Save / Send to approve say "Not connected yet". Both item dialogs open empty with the same note. Nothing is fetched or saved.
- No package changes. Tests: 128 files / 1,133 pass.
