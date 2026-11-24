# Form guidelines: stock-adjustment (UI revision 1, approved 2026-11-24)

- The required fields are Doc Date, Main Location, at least one picked row, and Physical Pcs and Cts on each picked row.
- Physical inputs:
  - Pcs: integer 0–999999.
  - Cts: 0–999999.999.
  - Price: 0–9999999999999999.99.
  - Paste is sanitised and a leading 0 is trimmed.
- Changing Physical Pcs does **not** rescale Cts. The count is entered as found, so the two fields are independent.
- Diff updates on every keystroke.
- Empty rows (not picked) are ignored on Save.
- Remark is ≤ 250 characters and Document Note is ≤ 250 characters with a counter. Ref. is ≤ 100 characters.
- Read-only states:
  - Pending Approval and Approved-with-approval-ON: everything is read-only.
  - Approved-auto: Edit unlocks it (ADR-0050 D4).
- Leaving the page with unsaved changes asks for confirmation, as other documents do.
