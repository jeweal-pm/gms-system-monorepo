# Handoff: sale → SA (service design request)

- Feature ID / UI revision: `sale` / UI revision 1 (**approved** 2026-11-18)
- **Status (2026-11-18): dispatched and answered.** SA revision 1 (**pending-review**) / source UI revision 1: [inventory/sale bundle](../../apps/backend/inventory/sale/decisions.md) + [ADR-0054](../../adr/0054-sale-document.md) (Proposed, SQ-SL-01…04). Placement `backend-api-inventory` (ADR-0052 D1 followed; master alternative = SQ-SL-01). BE-SL-001…008, INF-SL-001, DO-SL-001 in [todo/sale.md](../../task/todo/sale.md). Next: parent presents UI rev 1 and SA rev 1 + ADR-0054 to the owner; after approval → backend in the TODO order → infra nginx → frontend FE-SL-004…009.
- SA revision / source UI revision: 1 (approved 2026-11-18, ADR-0054 Accepted) / source UI revision 1
- From role/scope: ui-spec (documents only)
- To role/scope / parent integration owner: `sa`; parent serializes shared files (navigation, flow-status, approval registry, tech-stack, Compose/nginx)
- Exact TODO IDs and source documents: FE-SL-002…009 (requires-sa) in [todo/sale.md](../../task/todo/sale.md); [ui-spec](../../apps/frontend/sale/ui-spec.md), [open-questions](../../apps/frontend/sale/open-questions.md) (Q-SL-01…16), [data-fetching](../../apps/frontend/sale/data-fetching.md), [error-handling](../../apps/frontend/sale/error-handling.md), [flow](../../diagram/sale-flow.md)
- Approval status, approved revision, and owner evidence: **none**. The owner request (2026-11-17, "sa uxui เขียน adr และ ui spec หน้า sale …") asks SA for an ADR, which authorizes SA design work on this draft. Implementation needs owner approval of UI rev 1 **and** separate approval of the SA bundle.
- Required contract / diagrams / ADRs: see "SA must design" below; a new Sale ADR (next free number after ADR-0053), sequence + database diagrams, API contract, BE-SL-* items in the central TODO.
- Dependency ledger entries and installation status: none proposed by UI.
- Allowed code/document paths: SA writes `document/apps/backend/<service>/sale/**`, `document/adr/00NN-sale-*.md`, the BE section of `document/task/todo/sale.md`; **no application code**.
- Integration-owned changes: `frontend/src/features/home/navigation.ts`, `frontend/src/features/trade-document/flow-status.ts`, approval registries, `document/adr/tech-stack.md`, Compose / nginx.
- Infra service bundle/revision, ADR/config drift, network/egress and secret-adapter prerequisites: one nginx photo location if line photos are approved (Q-SL-12, as ADR-0048). If SA places Sale in `backend-api-inventory` (ADR-0052 D1), the master ↔ inventory internal API, token and saga need infra review of the existing services (no new container).
- DevOps pipeline/source revision: no change expected unless the service placement changes build contexts.
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): current aggregate 1.75 vCPU / 2880 MiB after ADR-0052 (D14). Sale must stay within existing limits: ≤ 200 lines, pickers ≤ 50 per page (keyset), approve locks ≤ 200 rows in id order, no new cache/worker.
- Expected output and acceptance criteria: an SA bundle answering SA-SL-01…12 that the owner can approve in one review, with Q-SL defaults either adopted or replaced with stated reasons.
- Verification completed / not run: none (design request).
- Blocking item, if any: owner decisions on Q-SL-01/02/03 shape the design; SA can propose with the recommended defaults.
- Resume action and destination: SA bundle → parent presents for owner approval → backend → frontend (FE-SL-004…009).
- Corrective work ID / root-cause ledger link: not applicable (new work).
- Existing pass limit / allocated passes / active pass: not applicable.
- Changed evidence, contract, or prerequisite justifying this handoff: new feature; no Sale contract exists.
- Concrete receiving-role output / next fact needed: the service placement decision (SA-SL-01) and the reservation-consumption model (SA-SL-04).
- Stop reason / terminal outcome / explicit extension evidence: none.

## Facts found by ui-spec (C)

- Load to Stock is **approved (2026-11-17) and phase 1 implemented** (`backend-api-inventory`, `inventory.stock` with buckets incl. `sold_*`); no available-stock read or consume API exists (ADR-0052 D15 phases 2a/2b/3 pending).
- ADR-0052 D1 lists `sale` as a future module of `backend-api-inventory`; D15 phase 3 says "Sale in inventory consumes own stock locally and Memo Stock through a master API".
- Reserve and Memo Stock are in `backend-api-master` (`partner` schema). Reserve Approve moves Memo Stock `pending → reserved` (SA-RS-07); **Memo Out shares the `reserved` bucket**. `memo_stock` CHECK: `pending = received − returned − sold − reserved`; `purchased ≤ sold` (ADR-0042). The `sold` bucket has no customer-sale writer yet.
- Document Setup key `sale` (code SL), auth leaf `sale`, sidebar slug `sale` exist. Approval types (ADR-0050) and the approval registry lack `sale`.

## SA must design

| ID | Topic | UI expectation / recommended default |
|---|---|---|
| SA-SL-01 | **Service placement + Sale ADR** (Q-SL-02) | Decide master vs inventory for phase 1 and record it in an ADR (amending ADR-0052 D1 if master). ui-spec recommends master for phase 1 (both sources are master-owned; one local transaction), revisit before phase 2. Show capacity and saga cost of each. |
| SA-SL-02 | **Data model + read API** | `sale`, `sale_line`, `sale_charge` (+ photo table if SA-SL-09), shaped like `reserve*` with customer / shipping / invoice snapshots, currency + Selling Rate, ADR-0050 status + approval columns, ADR-0045 soft-delete columns, version. Migration (additive). `MasterMenu` `sale`; leaf `sale` VIEW/ADD/EDIT/DELETE/APPROVE mapping; Document Setup `sale` numbering + "used" count. `sale.options`, `nextNumber`, `list` (≤ 50, deleted filter), `get`. Grant `currency.options` to `sale:VIEW`. |
| SA-SL-03 | **Lines and Save validation** (Q-SL-04/06/07/08) | Each line has `source` RESERVE or STOCK (OWN_STOCK in phase 2) and exactly one reference; no manual lines. Unique per reference per document. Pcs/weight > 0 and ≤ open (reserve) / pending (stock) at Save without lock; Sale Price required > 0; item fields copied server-side. Field-addressed errors (`lines.N.*`, `exceeds_open`, `exceeds_pending`, reference invalid). |
| SA-SL-04 | **From Reserve query + reservation consumption** (Q-SL-03/05) | `sale.reserveLines`: approved, non-deleted Reserves of the given customer and currency, lines with open = reserved − sold (− released later) > 0, keyset ≤ 50, search, date range, index plan. Track per-line sold quantity on `reserve_line` (e.g. `sold_pcs`, `sold_weight_ct` with CHECK ≤ line qty). At Approve: lock reserve lines and memo_stock rows in id order, re-check, `reserve_line.sold += q`, `memo_stock.reserved −= q, sold += q`. Reserve stays Approved; define how the Reserve page/daybook shows sold or fully-consumed reservations (display only). Never consume Memo Out holds. |
| SA-SL-05 | **From Stock (memo) consumption** (Q-SL-01) | Grant `memoStock.list` to `sale:VIEW`. At Approve `memo_stock.pending −= q, sold += q` with the shared lock/guard (`takeFromMemoStock` family). Confirm effects on Purchase "Sold · must be purchased" (`sold − purchased`), Memo Outstanding › Vendor Sold column, Purchase Outstanding "Sale" column and Memo Outstanding › Customer. |
| SA-SL-06 | **Own stock plan (phase 2)** | Align with ADR-0052 D15: available-stock read for the Sale picker, `on_hand → sold` consumption, Load Sale Price as price source (Q-SL-06), currency conversion. Not in rev 1 implementation; state prerequisites and the later UI/SA revision. |
| SA-SL-07 | **Approval** (Q-SL-09) | ADR-0050: approval type `sale` (master `APPROVAL_DOC_TYPES`, setting), Save → Draft or auto-approved, `submit`, Approve / Revise / Reject, Edit/Delete only in Draft/Revise, `restore`. Stock moves only at Approve (or auto-approved Save). Short → `SALE_*_SHORT` 409 with line fields, nothing changes. Notifications per ADR-0049. |
| SA-SL-08 | **Approve Center** | Registry entry (`lineTable`, party customer, stock per line), pending count, preview. |
| SA-SL-09 | **Line photos** (Q-SL-12) | ADR-0048 pattern: `sale_line_photo`, routes, nginx location (infra). |
| SA-SL-10 | **Contracts and errors** | tRPC (or REST) contract with `SALE_*` codes (`NOT_FOUND`, `STATUS_INVALID`, `CHANGED`, `DELETED`, `REFERENCE_INVALID`, short at approve), CSRF on writes, all bounds. |
| SA-SL-11 | **Diagrams** | Sequence (Save, Approve consuming both sources, concurrent approvals) and database diagrams; refine service interactions without duplicating [the main flow](../../diagram/sale-flow.md). |
| SA-SL-12 | **Out of scope confirmation** | Receivable/payment, Sale Person, print/invoice, sale from Memo Out, reversal (Q-SL-13…16) — confirm none needs schema now, or reserve columns only if cheap. |
