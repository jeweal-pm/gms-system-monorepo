# Handoff: purchase → SA (Purchase document service design)

- Feature ID / UI revision: `purchase` / UI revision 1 (**pending-review**; not approved yet)
- SA revision / source UI revision (if applicable): SA revision 1 requested / source UI revision 1
- From role/scope: ui-spec (`document/apps/frontend/purchase/**`, `document/diagram/purchase-flow.md`, `document/task/todo/purchase.md`)
- To role/scope / parent integration owner: SA (`document/apps/backend/master/purchase/**`, `document/adr/**`); the parent owns `document/task/index.md`, `frontend-latest.md` and `tech-stack.md`
- Exact TODO IDs and source documents:
  - BE-PU-001…005 and the FE items they block (FE-PU-003…006) in [todo/purchase.md](../../task/todo/purchase.md).
  - Sources: [ui-spec](../../apps/frontend/purchase/ui-spec.md), [open-questions](../../apps/frontend/purchase/open-questions.md), [data-fetching](../../apps/frontend/purchase/data-fetching.md), [error-handling](../../apps/frontend/purchase/error-handling.md), [flow](../../diagram/purchase-flow.md), [source image](../../apps/frontend/purchase/source/01-purchase-new.png).
- Approval status, approved revision, and owner evidence: **none**. The parent first presents UI revision 1 to the owner. SA may draft and research from this handoff (a draft permits research), but backend code waits for a separate SA approval.
- Required contract / diagrams / ADRs:
  1. **Decisions** (`decisions.md`, SA-PU-xx) answering the requires-sa questions, each with the owner's answer if one is given:
     - **Q-PU-03** stock effect (the main item). Cover the Memo Stock bucket (existing `sold` vs a new `purchased`, and the CHECK `memo_stock_balance`), what feeds Memo Outstanding › Vendor, and **where own stock (คลัง Pmr) lives**: the proposed `api-inventory` (see [inventory boundary](../../apps/backend/inventory/gms-platform/architecture.md)) or an interim master table. Also state what happens to From Stock pickers until own stock exists.
     - **Q-PU-05** manual rows: Stock ID counter (reuse `MemoStockIdCounter` `YY####`?), whether it is assigned on Save or Approve, and Location.
     - **Q-PU-06** approval states.
     - **Q-PU-04** part quantities / editable price.
     - **Q-PU-02** Purchase Order: nothing to build now, but leave room for a later `purchaseOrderLineId`.
  2. **API contract** for `purchase.options`, `nextNumber`, `list`, `get`, `create`, `update`, `delete`, `approve`; the grant change letting `memoStock.list` accept `purchase:VIEW`; error codes `PURCHASE_*`; strict Zod input; ≤ 200 lines; `expectedVersion`.
  3. **Database diagram**: `purchase`, `purchase_line`, `purchase_charge` in schema `partner`, following `memo_return`. Include the vendor snapshot per [ADR-0019 §4](../../adr/0019-vendor-master.md), the `document_numbering` relation (Document Setup `used`), and indexes for the daybook.
  4. **Sequence diagram**: save, and approve with the row lock and the pending-short guard.
  5. **ADR**: a new one if own stock or a new bucket or service is introduced. Otherwise extend ADR-0033/0034.
  6. Backend TODO rows in the central TODO.
- Dependency ledger entries and installation status: none proposed. No new package is expected for a master-service document.
- Allowed code/document paths:
  - SA: `document/apps/backend/master/purchase/**`, `document/adr/**` (new ADR), and the backend rows of `document/task/todo/purchase.md`.
  - SA does not write code.
  - Later backend scope: `backend-api-master/prisma/**`, `src/purchase/**` or `src/trade-document/**`, `src/master/{router,authorization,trpc-handler}.ts`, `src/document-setup/document-numbering.ts`, `src/common/errors.ts`, tests.
  - `src/app.module.ts` is integration-owned.
- Integration-owned changes: `backend-api-master/src/app.module.ts` wiring, plus `tech-stack.md`, the task index and the latest pointer, all through the parent.
- Infra service bundle/revision, ADR/config drift, network/egress and secret-adapter prerequisites (when containers change): **none if Purchase stays in `backend-api-master`.** If SA puts own stock in a new `api-inventory` container, route infra research per [infra delivery](../../workflow/infra-delivery.md) before review. In that case also include devops for the image pipeline.
- DevOps pipeline/source revision, Dockerfile/workspace dependencies, build/runtime variables, image platform and release/check requirements (when delivery changes): none unless a new service is chosen (see above).
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): the master-service option adds no container; queries are paged at ≤ 50 and documents hold ≤ 200 lines; the approve transaction locks only the touched `memo_stock` rows. A new inventory container must fit the current 1.70 vCPU / 2944 MiB aggregate ([capacity](../../infra/capacity.md)) or replace budget elsewhere.
- Expected output and acceptance criteria: a reviewable SA revision 1 bundle that answers every requires-sa question, together with the backend TODO rows. The parent presents it to the owner together with the UI review, or right after it.
- Verification completed / not run: none (documents only).
- Blocking item, if any: the owner's answers to Q-PU-01/03 change how much SA work is needed. If the owner chooses "document only" for Q-PU-03, the stock design shrinks to a note.
- Resume action and destination (backend -> frontend, etc.): SA bundle, then owner approval, then backend (BE-PU-002…005), then frontend (FE-PU-003…006), then tests and both security reviews, then manual-tester.
- Corrective work ID / root-cause ledger link (if applicable): n/a (new feature)
- Existing pass limit / allocated passes / active pass (inherit; never reset): n/a
- Changed evidence, contract, or prerequisite justifying this handoff: new feature; no Purchase backend exists (checked `backend-api-master/prisma/schema.prisma` and `src/**` on 2026-11-04).
- Concrete receiving-role output / next fact needed: the owner's answer to Q-PU-03, which decides where own stock lives and which bucket is used.
- Stop reason / terminal outcome / explicit extension evidence, if any: —

## UI revision 2 additions (ui-spec, 2026-11-04)

The data needs below were added after UI revision 2 ([ui-spec Revision 2](../../apps/frontend/purchase/ui-spec.md#revision-2-add-memo-stock-and-purchase-order-dialogs)):

- **R2-D-01:** what "Sold to customers" means and where the invoice data comes from (Q-PU-16).
- **R2-D-02:** per-item status, its quantity and cap, and how the buckets move.
- **R2-D-03:** status filter, counts, Sold-first order, invoice search and the `purchase:VIEW` grant.
- **R2-D-04:** piece type (Pair / Parcel / Single) and a real location.
- **R2-D-05:** a query for open PO lines.
- **R2-D-06:** `purchase_line.purchase_order_line_id`, plus the locked write to `purchase_order_line.purchased_*`.
- **R2-D-07:** a server rule that picked rows change only pcs, weight, price and the item note.

## SA result (2026-11-04)

Answered by **SA revision 1, approved 2026-11-04**. Evidence is the owner's messages: "backend ทำ api เลย …" and the clarification "… ปุ่ม Purchase Order PU จะตัด stock จากการตัดใบ PO ที่มีการซื้อเข้าเข้ามา".

- Bundle: [decisions](../../apps/backend/master/purchase/decisions.md). It holds SA-PU-01…20, the R2-D-01…07 mapping and the SA defaults D1…D13.
- ADR: [ADR-0042](../../adr/0042-purchase-document-and-stock-deduction.md).
- Next step: [purchase-backend.md](purchase-backend.md).
- No infra or devops routing: no container changes.
