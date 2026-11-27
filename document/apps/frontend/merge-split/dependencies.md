# Dependencies: merge-split (UI revision 1)

**No new package.** Everything reuses installed code (Load to Stock components, `MemoStockModal`, `ItemEditorShell`, TanStack Query, existing decimal helpers). Nothing is added to the ledger in `document/adr/tech-stack.md`. No container, service or storage change from the UI side; the backend module lives in the existing `backend-api-inventory` (SA decides).
