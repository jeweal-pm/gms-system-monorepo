# 2026-11-13 Purchase rows without a Stock ID (frontend, FE-PU-014)

Follows ADR-0051 (accepted 2026-11-13, Q-PU-36…38) and BE-PU-008.

- **What changed for users**
  - On the Purchase page, a row keyed in by hand or added from a Purchase Order no longer gets a Stock ID. Its Stock ID shows "—" in the table (a PO row reads "— · from {PO No.}"), in the row panel and in the Add Purchase Order picker. "Auto" and "Assigned when you save" are gone.
  - Rows added from Memo Stock keep their Stock ID and the Sold / In stock tag.
  - The "No more Stock IDs this year" save message is removed; Purchase no longer issues Stock IDs.
- **Code:** `frontend/src/features/purchase/{api.ts,form.ts,components/PurchasePage.tsx,components/purchase-pickers.tsx}`, `frontend/src/features/quotation/{document-kind.tsx,components/items/ItemEditorPanel.tsx}` (new optional `stockIdEmpty` text for a `from-stock` kind).
- **Tests:** purchase unit / integration and Approve Center preview tests updated; full suite 109 files, 996 passed. `tsc` clean outside stale `.next/types`; `eslint .` no errors.
- **Smoke:** Purchase 5 on http://localhost:8080 shows "—" for its PO and manual rows and "260012 · Sold + In stock" for its Memo Stock row (`document/testing/screenshots/purchase/2026-11-13-no-stock-id.png`).
