# Frontend implementation guide

Verified against the checkout on **2026-10-11**. Read current manifests and source before
assuming versions or paths; accepted decisions are in [the ADRs](../../adr/tech-stack.md).

## Current code

- Package: `frontend`; pnpm workspace uses the root `packageManager` (currently 10.22.0).
- Next.js 16 App Router / React 19 / strict TypeScript; routes are in `frontend/src/app/`.
- Feature components currently live in `frontend/src/features/auth/` and
  `frontend/src/features/home/`. Reuse adjacent patterns; create feature folders as needed.
- Tailwind CSS 4; app styles and tokens are in `frontend/src/app/globals.css`.
- `frontend/src/providers/app-providers.tsx` owns QueryClient and the typed tRPC client.
  App data reaches the gateway via the same-origin `/api/trpc` route. Server state belongs
  in TanStack Query; do not duplicate it in client stores.
- `frontend/src/lib/auth-client.ts` uses Better Auth; auth and CRM routes have same-origin
  Next proxies. Frontend must not call an internal domain service directly.
- Installed UI tooling includes Lucide, react-hook-form, and Zod. Zustand, a sheet library,
  and a UI test runner are not currently installed. Verify manifests before proposing them.

## UI and hydration

Read the exact approved feature documents in `document/apps/frontend/<feature>/`, using
[the templates](template/) as document formats. Inspect the actual reference image/Figma;
do not reconstruct a whole page from a vague textual summary. Shared tokens must match the
approved design rather than illustrative template colors/fonts.

Use semantic HTML, labels, keyboard controls, and focus management for overlays. Cover
relevant loading, empty, error, success, and partial states. Keep initial server and client
output deterministic: derive current-time UI after mount or pass a stable snapshot, and
format dates with explicit locale/timezone. Do not use blanket hydration suppression to
hide an application rendering error. Preserve session-loading/redirect behavior and avoid
duplicate auth reads/request waterfalls without evidence.

## Typography scale (owner standard, 2026-10-16)

The owner set one type scale for the whole system: "แก้ไข font size ให้เป็นขนาดมาตรฐาน ให้ขนาดตัวอักษรปกติเป็น size 14 px Size หัวข้อเป็น 16px Size หัว lable เป็น 12 px" plus page titles 24 px. Tokens in `frontend/src/app/globals.css` (Tailwind `--text-*`); use only these four, never `text-sm`/`text-[15px]` etc.

| Class | Size / line height | Use |
|---|---|---|
| `text-gms-title` | 24 / 32 | page title (`h1`) on every page, login and print view |
| `text-gms-heading` | 16 / 24 | card, section, drawer, dialog and panel headings (`h2`/`h3`) |
| `text-gms-body` | 14 / 20 | normal text, field values, buttons, sidebar items, table cells, toasts (also the `body` default) |
| `text-gms-label` | 12 / 16 | field labels, group labels, helper/error text, breadcrumbs, badges, tooltips |

This supersedes the font sizes recorded in earlier feature design-system documents (user-permission, customer, vendor, app-navigation, company-profile).

## Dependencies, contracts, and capacity

Follow [UI delivery](../../workflow/ui-delivery.md): read approved TODOs and the central
dependency ledger; SA designs changed backend contracts before implementation. Install
approved packages serially through the parent integration owner. For new shared components,
record tokens/variants and compare reuse with library costs.

Production is **4 GB RAM / 2 vCPU total**, shared with services and PostgreSQL. Keep SSR,
client bundles, query sizes, cache memory, and parallel/background work bounded. Prefer
server pagination; virtualize lists only when the expected workload warrants it. Measure
performance before claiming an improvement or adding memoization/caching infrastructure.

## Checks and outputs

`pnpm --filter frontend typecheck`, `pnpm --filter frontend lint`,
`pnpm --filter frontend build` exist. Lint is ESLint, not an alias for typecheck.
No test script/runner is currently configured. Follow `frontend/AGENTS.md` for local Next
documentation before code edits. Use meaningful existing checks and browser evidence when
appropriate; never invent passed tests.

Task records: `document/task/`; handoffs: `document/coordination/handoffs/`; customer
reports/screenshots: `document/testing/user-check/`; changelog: `document/changelog/`.
