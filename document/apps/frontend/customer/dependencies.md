# Frontend dependency decisions: customer

- UI revision: 1
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **no additional packages** (ADR-0018 §4: "ไม่ติดตั้ง package ใหม่")

## Reused (already installed in `frontend/package.json`, verified 2026-10-14)

| Need | Installed package | Notes |
|---|---|---|
| Form state + validation, field arrays | `react-hook-form ^7.89.0` (`useForm`, `useFieldArray`), `@hookform/resolvers ^5.9.1`, `zod ^4.4.3` | Same rules as the backend (ADR §5) |
| Server state | `@tanstack/react-query ^5.104.1` (`useInfiniteQuery` for the drawer), `@trpc/react-query ^11.19.0`, `@trpc/client ^11.19.0` | Types from the `@gem-crm/backend-api-gateway` workspace import |
| Icons | `lucide-react ^1.52.0` | `Printer`, `FileSpreadsheet`, `CopyPlus`, `RotateCw`, `Plus`, `Save`, `Trash2`, `ChevronDown`, `ChevronRight`, `ChevronLeft`, `X`, `Search`, `ChevronsUpDown`, `Check`, `ShieldAlert`, `LoaderCircle` |
| Styling | `tailwindcss ^4.3.3` | `print:` variant for printing; `@container` queries for the address-card layout |

## Built in-house (no library)

| Need | Approach | Why no library |
|---|---|---|
| Currency/Country dropdown | Native `<select>` in a shared `SelectField` | Type-to-jump works on ~250 options; accessible by default; 0 kB |
| Address accordion | `<button aria-expanded>` + conditional body | Two states only |
| Print | `window.print()` + print-only view + `print:` utilities | ADR §5 explicitly says no library |
| Dialog, toast, switch, checkbox, drawer | Promoted user-permission primitives | Already built and reviewed |
| Debounce (search) | `setTimeout` in a small hook | One use |

## Proposals

| Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| none | — | — | — | — | — | — | — | — |

Related, **not** proposed by this feature:

- `libphonenumber-js` / `country-flag-icons` (user-permission DEP-UP-01/02, still `proposed`). They become relevant only if the owner wants the customer phone selector to cover all countries (Q-CUS-01). Until then the promoted PhoneField keeps its current US/TH list.
- Excel export library: deferred by ADR-0018 (Excel is disabled).
- Country/state/city data library (for example `country-state-city`): rejected in ADR-0018 Alternatives.

Ledger action for the parent: none required. Optionally add a row "none (frontend) — customer UI rev 1 reuses installed packages" in the same way as the backend "none" note.
