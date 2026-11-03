# ADR-0040: One global decimal setup for weight and price display and entry

- Status: Accepted 2026-11-03 (owner approved SA revision 1; Q-DEC-14 changed to copy Document Setup grants)
- Date: 2026-11-03
- Number: drafted as ADR-0038; renumbered to ADR-0040 on 2026-11-03 when merged with `change-to-nginx-with-new-skill-agent` (ADR-0038 = quotation From Stock, ADR-0039 = Memo Outstanding From Customer). The two 20261103090000 decimal-setup migrations keep "ADR-0038" in their header comment so their applied checksums stay valid.
- Feature / source UI revision: `decimal-setup` / UI revision 2 (in preparation by the parent; [ui-spec](../apps/frontend/decimal-setup/ui-spec.md))
- SA revision: 1 (first backend design for this feature)
- Deciders: project owner; approval pending
- Approval evidence: none
- Supersedes / related ADRs: replaces the per-page model of decimal-setup UI revision 1 (frontend mock); related [ADR-0016](0016-per-user-menu-action-permissions.md), [ADR-0020](0020-username-login-and-permission-matrix-v2.md), [ADR-0024](0024-production-host-4gb-2vcpu.md), [ADR-0025](0025-gms-domain-routing-and-trpc.md), [ADR-0031](0031-private-master-authorization-boundary.md), [ADR-0032](0032-quotation-backend-in-master-service.md), [ADR-0037](0037-app-shell-tabs.md)

## Context

Owner request 2026-11-03: "sa uxui Decimal Setup ให้มันไม่ต้องมี Decimal Places by Page ให้มัน set decimal ทั้ง web เลย frontend backend ทำ ui และ api ด้วย".

Revision 1 stored per-page weight/price places in browser `localStorage` (`gms.decimal-setup.v1`) and no page used them.
Today every page shows money and weight with 2 decimals (`frontend/src/features/quotation/lib/format.ts`, plus a float-based copy
in `memo-outstanding-vendor/model.ts`); weight inputs accept 3, price inputs 2. Storage in schema `partner` is fixed:
74 money columns `numeric(18,2)`, 16 weight columns `numeric(12,3)`; server totals round half-up to 2 dp
(`backend-api-master/src/quotation/quotation.calculate.ts`, mirrored by the frontend). Bundle:
[document/apps/backend/master/decimal-setup/](../apps/backend/master/decimal-setup/architecture.md), TODO
[decimal-setup.md](../task/todo/decimal-setup.md) revision 2.

## Decision

1. **One row, one owner.** `backend-api-master` owns a single-row table `partner.decimal_setup` (id = 1, `weight_places`,
   `price_places`, `version`, `updated_by`, `updated_at`), seeded by migration with weight 2 / price 2
   ([database diagram](../apps/backend/master/decimal-setup/database-diagram.md)). No new service, container or package.
2. **Ranges.** Weight and price places 0–4 (Q-DEC-08 as changed by the owner 2026-11-03, "Choose 0–4, but show only"). Display only: typing and storage stay at weight 3 / price 2 places; no column widening (migration `20261103120000_decimal_setup_places_max_4`).
3. **tRPC `decimalSetup.get` / `decimalSetup.save`** ([api-contract](../apps/backend/master/decimal-setup/api-contract.md)).
   `get` is readable by any signed-in, licensed user with current authorization (no menu grant), because every page needs it
   to format numbers. `save` needs a new catalog leaf `decimal-setup:EDIT` + CSRF and uses optimistic `expectedVersion`
   (same pattern as Document Setup / Company Profile).
4. **Presentation and entry rule, not a storage rule.** The setting controls (a) how weights and money values are displayed
   everywhere in the web app (half-up rounding of the display only) and (b) how many decimals new keyboard input accepts in
   weight and price fields. Stored values, server validation (storage scale) and server calculations (2 dp half-up) are
   unchanged (Q-DEC-10, Q-DEC-11). Existing documents are never rewritten.
5. **Not affected:** pcs (always 0), percentages (discount %, tax rate), exchange rates, currency buying/selling rates, and
   the stored/calculated precision of `net_unit_price` and `discount_value` (Q-DEC-12).
6. **Frontend delivery:** one `DecimalSetupProvider` inside the App Shell loads `decimalSetup.get` once (staleTime 10 min),
   exposes `useNumberFormat()`; all formatting goes through one exact (bigint) formatter module with explicit places.
   API failure falls back to the defaults 2/2 without blocking any page. The revision-1 `localStorage` key is deleted.

## Alternatives

- **Keep per-page settings (rev 1):** rejected by the owner.
- **Widen columns to 4 decimals:** ~90 `ALTER COLUMN TYPE` changes (74 money + 16 weight) across quotation, reserve and memo
  tables with table rewrites under `ACCESS EXCLUSIVE` locks, every zod `decimal(p,s)`, both calculators, report SQL and the
  generated client, plus new rounding rules for totals. High cost and regression risk for no stated business need; deferred
  to a separate ADR if the owner needs 3–4 price decimals.
- **Server enforces the setting on input / rounds totals to the setting:** re-saving an older document with more decimals
  would fail or change its totals after an admin lowers the setting; every write path would read the setting inside its
  transaction. Rejected for this revision; offered as Q-DEC-11 option B.
- **Setting readable only with `decimal-setup:VIEW`:** pages of users without that grant would silently use defaults and
  show different numbers from colleagues. Rejected.
- **Module-level mutable value read by `formatMoney` without React context:** least churn, but memoized components would
  not re-render after a save and tests become order-dependent. Rejected in favour of context + explicit places.

## Consequences and capacity

- Compatibility: additive migration (one table, one seed row); the router gains one sub-router; the auth catalog gains one
  leaf `decimal-setup` (VIEW, EDIT): 42 leaves, **360** applicable cells (was 41 / 358). The User and Permission counter reads
  `applicableCount` from the server, so it changes to 360 automatically. Existing grants are unchanged; nobody holds
  `decimal-setup` until an admin grants it (super admin always can) — Q-DEC-14.
- Rollback: drop the router entries and the table (no other table references it); frontend falls back to defaults 2/2,
  which equal today's display.
- Display-only rounding means a displayed total can differ from the sum of displayed line values by at most
  half a unit in the last shown place per line when price places < 2 (documented in the UI help text).
- Capacity: one primary-key read per app load and per 10-minute focus refetch; one single-row update per save. No pool,
  cache, worker or container change; fits ADR-0024 (4 GB RAM / 2 vCPU) unchanged. No infra or devops scope beyond the normal
  `backend-api-master` / `frontend` rebuild.

## Acceptance and approval

Covers: this ADR; `document/apps/backend/master/decimal-setup/{architecture,api-contract,authorization,database-diagram,
sequence-diagram,error-handling,dependencies,testing,decisions}.md`; `document/diagram/decimal-setup-flow.md`; TODO
`document/task/todo/decimal-setup.md` revision 2 (BE-DEC-001…005, FE-DEC-101…106); Q-DEC-08…18 defaults. No package.
Checks: migration applies with no drift; `get` works for a licensed user with no grants; `save` refused without
`decimal-setup:EDIT`, stale version → `DECIMAL_SETUP_CHANGED`; after a save every page shows the new places within one
reload; API down → pages show 2/2. Keep **Proposed** until the owner approves this exact revision.
