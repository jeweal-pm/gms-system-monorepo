# Frontend dependency decisions: vendor

- UI revision: 1
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **no additional packages**

## Reused (installed in `frontend/package.json`; the same set the customer page uses)

| Need | Installed package |
|---|---|
| Form state, field array, validation | `react-hook-form`, `@hookform/resolvers`, `zod` |
| Server state | `@tanstack/react-query`, `@trpc/react-query`, `@trpc/client` |
| Icons | `lucide-react` (`Printer`, `FileSpreadsheet`, `CopyPlus`, `RotateCw`, `Plus`, `Save`, `Trash2`, `ChevronDown`, `ChevronRight`, `X`, `Search`) |
| Styling | `tailwindcss` (`print:` variant, `@container` queries for the 4-column address grid) |

## Built in-house

Everything else comes from the shared `frontend/src/components/ui/*` primitives and the Partner Master
components extracted from customer (FE-VEN-001). No library is needed for the vendor-specific parts
(one address type, a different grid).

## Proposals

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | — | — | — | — | — | — | — | — |

Not proposed: `libphonenumber-js` (only relevant if the owner wants all phone countries; customer Q-CUS-01 kept
US/TH), an Excel library (Excel stays disabled), country/state/city data (rejected in ADR-0018).
Ledger action for the parent: none.
