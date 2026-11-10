# 2026-11-10 Approve Center: document preview modal (UI rev 2)

- Feature: `approve-center` UI revision 2, approved 2026-11-10 (owner "Approve and start"); TODO FE-AP-013…015 in [todo/approve-center.md](../task/todo/approve-center.md); spec [ui-spec › Revision 2](../apps/frontend/approve-center/ui-spec.md#revision-2-document-preview-modal).
- Clicking a document number in Approve opens a modal with that document (no navigation, Q-AP-19): Pending approval badge, "{menu} {docNo}", last-saved time and waiting time; Doc Date, Customer/Vendor, currency · rate; lines (stone code or Stock ID, stone, "Ordered by" + customer on customer documents (Q-AP-20), pcs, weight, value in the company currency = amount × rate (Q-AP-17), location); total row and a grand-total line only when it differs (Q-AP-21); document note.
- Footer: Close; Reject…/Revise… disabled as in the table (Q-AP-18); Approve opens the existing confirm and approves the **version the modal loaded** (no second `get`), so an edit made meanwhile fails with the existing "changed" message.
- No backend change: the modal reads the existing per-document `get` and `currency.options`.
- Files: `frontend/src/features/approve-center/preview.ts` (new), `components/DocumentPreviewModal.tsx` (new), `components/ApprovalTable.tsx`, `components/ApproveCenterPage.tsx`, `api.ts`; tests `frontend/test/approve-center/preview.test.ts` (new), `table.test.ts`, `approve.integration.test.ts`, `fixtures.ts`.
- Verification: see the TODO evidence line. Security reviews (FE-AP-016) pending.
