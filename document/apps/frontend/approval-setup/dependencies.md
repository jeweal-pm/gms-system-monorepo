# Frontend dependency decisions: approval-setup

- UI revision: 1 (pending-review)
- Decision: **no new package**. [tech-stack.md](../../../adr/tech-stack.md) is unchanged (no ledger entry needed).

| Need | Existing solution (installed) | Why no package |
|---|---|---|
| Toggle | `components/ui/switch.tsx` (`role="switch"`) | already accessible; design differs only in size/track color (Q-AS-19) |
| Modal dialogs | `components/ui/confirm-dialog.tsx` (native `<dialog>`, focus return) | additive `confirmVariant` prop covers source 03 |
| Icons | `lucide-react` (installed) for arrows/chevron/info/retry; tile icon via the existing `designIcon` helper | — |
| Server data | `@tanstack/react-query` + `@trpc/react-query` (installed) | same as approve-center |
| Table | semantic `<table>` (approve-center pattern) | 11 fixed rows; no sorting/virtualisation needed |

Runtime cost: no bundle growth beyond feature code; no new request types in phase 1 (counts share the approve-center cache).

Backend/infra: phase 2 adds one small settings table and procedures in `backend-api-master` plus one auth catalog leaf (SA decides). No new container, image, network or storage, so no infra/devops routing is expected; SA confirms.
