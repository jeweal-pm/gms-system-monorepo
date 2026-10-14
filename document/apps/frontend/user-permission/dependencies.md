# Frontend dependency decisions: user-permission

- UI revision: 1
- Central ledger: [tech-stack.md](../../../adr/tech-stack.md)
- Status: **proposed** (two conditional packages; nothing installed)

## Reused (already installed in `frontend/package.json`)

| Need | Installed package | Notes |
|---|---|---|
| Form state + validation | `react-hook-form ^7.89.0`, `@hookform/resolvers ^5.9.1`, `zod ^4.4.3` | Create/edit form, password 4–64 |
| Icons | `lucide-react ^1.52.0` | Printer, FileSpreadsheet, CopyPlus, RotateCw, X, Chevron*, Search, ImagePlus, ShieldCheck, Check, Minus, Plus, Loader2 |
| Server state | `@tanstack/react-query ^5.104.1`, `@trpc/react-query ^11.19.0` | After SA approval |
| Styling | `tailwindcss ^4.3.3` | Tokens via `@theme` |

Built in-house with native elements (no library proposed): Dialog (`<dialog>.showModal()` handles modality,
focus and Esc), drawer (`<aside>`), toast (`aria-live` region), tri-state checkbox (native `indeterminate`),
switch (`role="switch"` button), tabs (links), and the matrix (`<table>`). The **Location multi-select** is
the most complex in-house primitive: a combobox plus listbox following the WAI-ARIA APG pattern.
A headless library such as `@base-ui-components/react` or Radix (which has no multi-select) was considered.
It is not proposed, to avoid adding a UI kit for one control. If the owner prefers a kit for future
Setup pages, SA/ui-spec should evaluate it as a separate decision.

## Proposals

| ID | Package / workspace | Status | UI component / TODO IDs | Official compatibility evidence | Alternatives | Bundle/runtime cost | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|---|
| DEP-UP-01 | `libphonenumber-js` (latest checked **1.13.15**) in `frontend` | proposed (only needed if Q-UP-09 requires per-country validation/formatting) | C-11 PhoneField / FE-UP-004, FE-UP-005 | [npm registry metadata](https://registry.npmjs.org/libphonenumber-js/latest): MIT, no runtime dependencies, ESM `exports`, `sideEffects: false`. [README](https://gitlab.com/catamphetamine/libphonenumber-js): `min` metadata ≈ 80 kB, `max` ≈ 145 kB, `mobile` ≈ 95 kB; `isValidPhoneNumber()` checks length and per-country patterns. Framework-agnostic, so it works with React 19 / Next 16. | (a) Zod regex + length check only (0 kB, less accurate). (b) Server-only validation by SA. (c) Restrict to a small country list with hand-written rules. | Client bundle ≈ 80 kB raw for `min` metadata (estimate; can be loaded lazily only on this route). No server/runtime cost. | none (ordinary UI library) | none | not installed |
| DEP-UP-02 | `country-flag-icons` (latest checked **1.6.20**) in `frontend` | proposed (only if the country selector must show flags across many countries) | C-11 country selector / FE-UP-004 | [npm registry metadata](https://registry.npmjs.org/country-flag-icons/latest): MIT, no runtime dependencies, React components under `country-flag-icons/react/3x2/<CODE>` (React supplied by the app), `sideEffects: ["*.css"]` so imports are tree-shaken per country. | (a) Inline SVG for a short approved country list (0 dependency). (b) Unicode flag emoji: **not acceptable**, because Windows does not render flag emoji and shows the letters "US". (c) No flag, dial code only. | Roughly 1 small SVG component per imported country (estimate: a few hundred bytes to ~2 kB each). No runtime cost. | none | none | not installed |

Excel export and print are **not** given a frontend package. The proposal is server-generated export
(SA decision, Q-UP-16) so the client bundle stays small and the export can be bounded server-side. If SA
chooses client-side generation, a separate proposal (for example `exceljs`) must be evaluated and approved first.

Install nothing until the owner approves UI revision 1 **and** answers Q-UP-09. Frontend and the parent
integration owner then edit `frontend/package.json` and `pnpm-lock.yaml` serially and update the ledger with the
installed version.
