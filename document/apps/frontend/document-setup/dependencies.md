# Frontend dependency decisions: document-setup

- UI revision: 1 (pending-review)
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **no additional packages**

Reused: React 19 / Next.js 16, react-hook-form (`useFieldArray`), Zod 4, TanStack Query + tRPC, Tailwind 4 tokens, lucide-react icons, existing `@/components/ui/*`. The date column uses the native `input type="date"` (no date-picker library is installed; adding one would be a separate proposal). The table is plain semantic HTML like the permission matrix; no table library is needed for ≤ 50 rows.
