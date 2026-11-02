# ADR-0036: Reserve document in the master service (holds Memo Stock for a later Sale)

- Status: Accepted (2026-11-02)
- Date: 2026-11-02
- Feature / source UI revision: `reserve` / 1
- SA revision: 1 ([decisions](../apps/backend/master/reserve/decisions.md), [API contract](../apps/backend/master/reserve/api-contract.md))
- Deciders: project owner
- Approval evidence: owner 2026-11-02: "อนุมัติ reserve revision 1" (covers this ADR, SA rev 1, ui-spec rev 1, TODO rev 1, Q-RS-01…08).
- Related: [ADR-0033](0033-memo-documents-in-master-service.md) (document engine; revision 2: Memo Out cuts Memo Stock), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md) (Memo Stock), [ADR-0035](0035-memo-outstanding-vendor-report.md) (buckets), [ADR-0027](0027-gms-master-inventory-data-and-operations.md) (inventory, later)

## Context

The owner wants a Pre-Sale › Reserve page that holds stones for a customer, so they can be sold later on the Sale page. The design is the Quotation / Memo Out page with From Stock.

The owner's answers (Q-RS-01…04, 2026-11-02):
- One From Stock button covering Memo Stock and, later, our own stock.
- Stock is held at approval.
- Release comes later.
- Rows keyed in by hand hold nothing.

The catalog leaf `reserve` and the Document Setup key `reserve` already exist. Memo Stock already has a Reserve bucket, which Memo Out approval fills (Q-MOV-04).

## Decision

1. **New document `reserve`** in `backend-api-master`, schema `partner`: tables `reserve`, `reserve_line` and `reserve_charge`, on the shared trade-document engine. It has the Memo Out revision 2 shape: a customer with shipping and invoice addresses, Document Setup numbers, PENDING_APPROVAL → APPROVED, and From Stock lines naming a Memo Stock item.
2. **Approval holds stock.** It moves each stock line's quantity from Memo Stock pending into the **Reserve** bucket, through the same locked, guarded `takeFromMemoStock` that Memo Out and Memo Return use. Memo Out and Reserve share the bucket.
3. **One shared implementation.** The customer party, the From Stock line rules and the approval body are extracted from Memo Out into one module that both documents use. The Memo Out contract and behaviour don't change.
4. **Not now:** release / cancel, Sale (Reserve → Sold), our own stock in From Stock.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Reuse the Memo Out tables with a document-type column | Memo Out has its own numbering key, permissions and later flows (Memo Out Return). Separate tables keep the CHECKs, numbering and grants simple, the pattern ADR-0033 chose. |
| Hold stock on save | The owner chose approval (Q-RS-02, Q-MR-15). Saving would need undo on every edit and delete. |
| A separate Reserve bucket per document type | The report's Reserve column already means "Reserve or Memo Out approved" (Q-MOV-04). One bucket keeps the balance CHECK unchanged. |

## Consequences and capacity

- One additive migration with three tables and no backfill. Rollback is allowed while no Reserve is approved.
- Approved reservations stay held until the release revision (Q-RS-03).
- This remains the interim deviation from ADR-0027 that ADR-0034 accepted. Our own stock joins From Stock when inventory exists.
- No new process, cache, route or package. Bounds are the same as Memo Out: ≤ 200 lines; approval locks ≤ 200 rows in one transaction; lists ≤ 50.

## Acceptance and approval

- Save → Pending Approval with a Document Setup number, holding nothing.
- Approve → Approved, read-only; Memo Stock pending → Reserve; Memo Outstanding shows it.
- A short item → `RESERVE_PENDING_SHORT`, and nothing changes. Manual rows hold nothing.
- Covers:
  - this ADR;
  - [ui-spec rev 1](../apps/frontend/reserve/ui-spec.md), [open questions Q-RS-01…08](../apps/frontend/reserve/open-questions.md) and [testing](../apps/frontend/reserve/testing.md);
  - [SA bundle rev 1](../apps/backend/master/reserve/decisions.md) (decisions, api-contract, database-diagram, sequence-diagram);
  - [main flow](../diagram/reserve-flow.md);
  - [TODO rev 1](../task/todo/reserve.md).

  No packages.
