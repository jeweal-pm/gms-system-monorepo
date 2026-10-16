# 2026-10-16 Customer rev 3 / Vendor rev 4 frontend (FE-CUS-R3-001…007, FE-VEN-R4-001…006)

- Drawer draft row title is fixed: "New customer" / "New vendor", subtitle "Not saved yet", Draft badge. It no longer mirrors the Code Name or Name being typed.
- New address card (shared `features/partner/components/address-item.tsx`, `address-list-card.tsx`) for Customer Invoice + Shipping and Vendor Invoice: "#N" outside on the left; light gray rounded card; no accordion chevron and no "Default" badge; first row has "Set as default address" (left) and the red trash icon (right); field grid unchanged; dashed add button and count badge kept.
- Default rules unchanged: Customer exactly one default (the ticked default stays checked with `aria-disabled`; a new customer starts with #1 ticked); Vendor 0 or 1 (toggles freely; a new vendor starts unticked).
- Trash: #1 still cannot be removed and is now shown disabled; in view mode the checkbox and trash are disabled. After removing an item, focus moves to the previous card's checkbox.
- Frontend-only. No API, contract, package, lockfile, provider, Docker or backend change.
- Evidence: TODO sections "Revision (customer rev 3 / vendor rev 4) frontend" in `document/task/todo/customer.md` and `vendor.md`; `document/apps/frontend/customer/testing.md` revision 3 checks. Typecheck/lint pass; `/setup/customer` and `/setup/vendor` 200 after a frontend restart. Browser checks, an automated suite (no runner installed) and security reviews are **not** done, so the TODOs stay open.
