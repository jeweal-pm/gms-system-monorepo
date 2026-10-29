# ADR-0033: Memo Out and Memo Out Return documents in the master service (before inventory)

- Status: Accepted (2026-10-28)
- Date: 2026-10-28
- Feature: `memo-out` (UI rev 1) and `memo-out-return` (UI rev 2)
- SA revision: 1 ([decisions](../apps/backend/master/memo-out/decisions.md), [API contract](../apps/backend/master/memo-out/api-contract.md))
- Deciders: project owner
- Approval evidence:
  - Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย". This is a direct instruction to build the API.
  - Owner answer the same day to the party question: "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor".
- Related: [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0032](0032-quotation-backend-in-master-service.md), [document-setup SA rev 1](../apps/backend/master/document-setup/decisions.md)

## Context

Memo Out (stones sent to a customer on memo) and Memo Out Return (a vendor document) have UI specs and page structures. The owner asked for real saving with numbers from Document Setup. ADR-0027 puts stock documents and movements in a future inventory service, which is not built or authorized yet.

## Decision

1. **Owner:** `backend-api-master`, schema `partner`, tables `memo_out(_line, _charge)` and `memo_out_return(_line, _charge)`. Migration `20261028090000_memo_out` is additive. No new service, container or network.
2. **One shared engine** (`src/trade-document/document-engine.ts`) instead of a copy per document. The engine provides the quotation rules:
   - Document Setup number: max + 1 under the numbering-row lock, plain 1, 2, 3 … when no row is in effect.
   - Snapshots of the party and its addresses.
   - Server totals with the quotation calculator.
   - Optimistic `version`.
   - Drafts only, in revision 1.
   Each document plugs in a party adapter. Memo Out uses a customer with SHIPPING and INVOICE addresses; Memo Out Return uses a vendor with one address. The numbering helpers take the document type, and Document Setup counts a row as used when a quotation, memo out or memo out return references it.
3. **No stock posting and no photos in revision 1.**
   - Saving changes no stock data. Posting moves to the inventory service later (ADR-0027).
   - Line photos are rejected (`photoIds` must be empty) until a photo route is added.
   - From Stock (Memo Out) and Memo Outstanding (Memo Out Return) stay disabled. Memo Out Return lines are typed by hand, because no vendor memo source exists yet.
4. **Permissions:** existing catalog leaves `memo-out` and `memo-out-return` (VIEW/ADD/EDIT/DELETE). `currency.options` is also readable with them.

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| Copy the quotation service per document | Two more ~500-line copies drift apart; the engine keeps one implementation of numbering, totals and guards. |
| Generic single `document` table | Party columns differ per document; per-type tables keep CHECKs and FKs simple and a later move to inventory mechanical. |
| Wait for the inventory service | Not authorized; blocks saving entirely. |

## Consequences

- The quotation code keeps its behavior. Its shared parts (`tradeDocumentFields`/`tradeDocumentRules`, `stoneLineOptions`, `customerLineOptions`, numbering helpers) are now exported and reused.
- The frontend has one shared document form (`features/trade-document/document-form.tsx`) on the Quotation components. The row-panel photo field shows "come in a later update" on memo documents.
- Bounds as quotation: ≤ 200 lines, list pages ≤ 50, options ≤ 1,000 rows, one transaction per save. No new process or cache.
