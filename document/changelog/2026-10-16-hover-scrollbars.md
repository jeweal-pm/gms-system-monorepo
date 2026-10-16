# 2026-10-16 Hover-only scrollbars (whole frontend)

- Owner: "เอา scroll bar ออกให้หน่อยให้ขึ้นแค่ตอน hover ในทุกๆหน้า".
- `frontend/src/app/globals.css` (`@layer base`): every element uses `scrollbar-width: thin` with a transparent thumb; on `:hover` the thumb uses `--color-gms-text-placeholder`. WebKit fallback via `::-webkit-scrollbar*` (8 px). The track keeps its width, so content does not shift when the thumb appears. The `scrollbar-none` utility (sidebar lists, utilities layer) still hides scrollbars completely.
- Verified in the dev CSS (base vs utilities layer order); frontend container restarted. Visual browser check not run. Touch devices have no hover: their overlay scrollbars appear while scrolling as usual.
