# Dependencies: stone-master (UI revision 1)

**One package added after approval: `motion` 14.0.0** (exact) — owner 2026-10-19: "frontend หน้า stone code อยากได้ drag and drop คล้ายๆแบบนี้ https://21st.dev/…/reorder-list อยากได้ animation คล้ายๆแบบนี้", then chose "ใช้ motion 14.0.0 (Recommended)". Used only by `components/part-order-list.tsx` (`Reorder.Group/Item`, `useDragControls`, `MotionConfig reducedMotion="user"`). The native drag below is replaced; keyboard reorder (ArrowUp/ArrowDown on the handle) and the live announcement stay.

| Need | Choice | Alternatives considered |
|---|---|---|
| Reorder Stone Code parts (S4 drag handles) | Native: pointer events on the handle for mouse/touch drag, plus ArrowUp/ArrowDown on the focused handle; `aria-live` announcement | `@dnd-kit/core` / `@dnd-kit/sortable` (accessible, but a new dependency for one list of 7 rows): not proposed. If native drag proves unreliable, raise it as a separate dependency proposal |
| Multi-select with chips (S3) | Existing `multi-select.tsx` (user-permission), moved to `components/ui/` | Headless libraries: not needed |
| Radios | Native `input type="radio"` styled with tokens | — |
| Forms / data | react-hook-form 7.89, Zod 4, tRPC 11, TanStack Query 5 (installed) | — |
