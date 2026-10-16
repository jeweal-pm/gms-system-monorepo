# 2026-10-16 Customer rev 2 / Vendor rev 3 frontend (ADR-0021, FE-CUS-019…025, FE-VEN-014…019)

- Shared Partner Master header (`features/partner/components/partner-page-header.tsx`) now follows User & Permission: title "Add Customer/Vendor" or the record name, "{Entity} List N", Print / Excel (disabled + tooltip) / Duplicate / Refresh, then Create {Entity} / Cancel / Save / Edit / Delete.
- Customer and Vendor pages use create / view (read-only) / edit modes; Cancel restores saved values (edit) or returns to the previous record (create); Delete keeps its dialog.
- Code Name is required (`*`, trimmed, 1–120, "Code Name is required"), prefilled in create mode from `customer.nextCode` / `vendor.nextCode`; `*_CODE_TAKEN` shows the field error and refetches the suggestion. Server `code:"required"` maps to the same message.
- Drawer rows: bold Code Name, Name on the second line; Active dot and Inactive badge unchanged.
- No package, lockfile, provider, Docker or backend change.
- Evidence: TODO sections "Revision (ADR-0021) frontend" in `document/task/todo/customer.md` and `vendor.md`; `document/apps/frontend/customer/testing.md` revision 2 checks. Typecheck/lint pass; live tRPC 15/15; logic script 34/34. Browser checks, an automated suite (no runner installed) and security reviews are **not** done, so the TODOs stay open.
