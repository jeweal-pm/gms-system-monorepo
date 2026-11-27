# Conventions: merge-split (UI revision 1, pending-review)

- Feature folder `frontend/src/features/merge-split/`: `components/MergeSplitPage.tsx`, `components/result-table.tsx`, `components/source-table.tsx`, `components/mode-dialog.tsx`, `components/result-row-panel.tsx`, `form.ts` (model, validation, C-01/C-02 math), `api.ts`; a test beside each file.
- Route `frontend/src/app/(app)/inventory/merge-split/` (`page.tsx`, `[id]/page.tsx`), same layout as `inventory/load-to-stock/`.
- Copy, do not reinvent: `features/load-to-stock/components/*` (page, mode dialog, load table, split group row, row panel on `ItemEditorShell`, location portal select), `features/trade-document/memo-stock-modal.tsx` (+ new `source: "merge-split"` variant), `approval-flow.tsx`, `flow-status.ts`, `document-api.tsx`. If a Load component is generalised instead of copied, keep Load's tests green (shared file, parent-serialized).
- Shared files (parent-serialized): `features/home/navigation.ts`, `memo-stock-modal.tsx`, `features/approve-center/menus.ts`, `features/approval-setup/model.ts`, `features/trade-document/flow-status.ts`.
- Numbers: pcs integer; weight per Decimal Setup; money 2 dp; decimal-safe helpers only.
- Text in English; "Merge/Split" as the page name, "Split" / "Merge" for modes.
