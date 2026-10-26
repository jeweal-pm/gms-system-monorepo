# ADR-0032: Quotation backend in the master service

- Status: Accepted (2026-10-26)
- Date: 2026-10-26
- Feature / source UI revision: `quotation` / frontend as built under [ADR-0025](0025-quotation-frontend.md) (mock data)
- SA revision: 1 (approved)
- Deciders: project owner
- Approval evidence: owner 2026-10-26 "อนุมัติ SA quotation rev 1" (after answering Q-QT-01/02/03/06/07/08)
- Supersedes / related ADRs: extends [ADR-0025](0025-quotation-frontend.md) phase 5 ("เชื่อม backend (ADR แยก)"); [ADR-0025 routing](0025-gms-domain-routing-and-trpc.md), [ADR-0027](0027-gms-master-inventory-data-and-operations.md), [ADR-0029](0029-gms-file-storage-for-auth-photos-and-company-logo.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md), [ADR-0031](0031-private-master-authorization-boundary.md); document numbering from [document-setup SA rev 1](../apps/backend/master/document-setup/decisions.md)

## Context

The Quotation page (`/pre-sale/quotation`, `/pre-sale/quotation/[id]`) is complete in the browser but
reads and writes mock data through `frontend/src/features/quotation/api.ts`. The owner asked on
2026-10-26: "frontend backend ต่อ api ในหน้า quotation ให้หน่อย ออกเอกสารมาหน่อย … adr ด้วย".

What already exists and can be reused:

- `backend-api-master` (`api-master`) serves customer, vendor, company profile, stone master and
  document setup over tRPC `/api/master/trpc` through nginx, with live authorization (ADR-0031).
- Customer + customer addresses (SHIPPING / INVOICE) in schema `partner`; stone codes in schema `stone`.
- Document Setup already lists the `quotation` transaction (default code `QT`) and its numbering rows,
  but no feature issues numbers yet (SA-DS-06).
- The permission catalog already has the `quotation` leaf with all nine actions.
- `@gms/storage` + `partner.stored_file` metadata for permanent uploaded files (ADR-0029/0030).

What does not exist: an inventory service and stock data (ADR-0027 gates it separately), and masters
for location, certificate type, labor name and service-charge type.

## Decision

1. **Owner:** `backend-api-master` owns quotations. New tables live in PostgreSQL schema `partner`
   (as Document Setup did), so no new service, container, schema role or network is needed. Tables are
   prefixed `quotation_` to keep a later move to a sales service mechanical.
2. **API:** a new tRPC router `quotation.*` on the existing master router (list, get, create, update,
   submit, approve, reject, cancel, delete, options) and a binary REST pair for line photos
   (`POST/GET /api/v1/quotation/photos…`) on the same service, like the company logo. Details in the
   [API contract](../apps/backend/master/quotation/api-contract.md).
3. **Status flow:** `DRAFT → PENDING_APPROVAL → APPROVED`, with `REJECTED` (editable, can be resubmitted)
   and `CANCELLED` (final). Each move checks the `quotation` permission action (ADD, EDIT, APPROVE,
   CANCEL, DELETE). Approve/Reject are used from the separate **Approve** page (later); the Quotation
   page has no approve buttons. The creator may approve with `quotation:APPROVE` (owner 2026-10-26).
   **Corrected by the owner 2026-10-26** ("ลบปุ่ม send of approval ไปเลยบอกเเล้วว่า quotation ไม่มี approve"): Quotation has **no approval step**. Quotations stay `DRAFT` (editable and deletable by permission); the Quotation page has no Send for Approval / Approve / Reject / Cancel buttons. The `submit`/`approve`/`reject`/`cancel` procedures remain in the API but are not used by the UI.
4. **Document number:** issued by the server on the first save from the Document Setup row in effect on
   the document date (`prefix + separator + running number`). The running number is the highest one
   stored for that numbering row + 1, read while the row is locked, so deleting the latest quotation
   frees its number (owner 2026-10-26). The new form previews the next number. Numbering rows that
   issued a number become locked in Document Setup (Q-DS-06, now implemented).
5. **Snapshots:** the quotation stores ids **and** a text snapshot of the customer, both addresses and each
   line's stone attributes, so a printed or approved quotation never changes when masters change.
6. **Money:** the server recomputes every amount with exact decimals (`Prisma.Decimal`, already installed)
   using the formulas of ADR-0025 D5, and stores the totals. The browser's totals are only a preview.
7. **Photos:** up to 4 per line, JPEG/PNG ≤ 5 MB, stored through `@gms/storage` under module
   `quotation-photo`, metadata in `partner.stored_file`, kept permanently (ADR-0030).
8. **Out of scope for this revision:** From Stock (no inventory yet — the button is disabled with a
   message), Print/Excel output, and masters for location/certificate/labor/charge types (free text or
   fixed lists for now).

## Alternatives

| Alternative | Reason not chosen |
|---|---|
| New `api-sales` service + `sales` schema now | Adds a container, DB role, pool and deploy pipeline on a 4 GB host for one document type; ADR-0027 does not require it yet. The `quotation_` prefix keeps extraction possible. |
| Keep numbering in the browser | Two users would get the same number; numbers must be issued under one database lock. |
| Separate counter table (never reuses numbers) | The owner wants a deleted latest number reused ("ล่าสุดใน db + 1"); max + 1 under the row lock does that without a second table. |
| Store only master ids (no snapshot) | An approved quotation would change when a customer address or stone code is edited. |
| Wait for inventory before any backend | Blocks saving quotations entirely; manual lines cover today's need. |

## Consequences and capacity

- One Prisma migration in schema `partner` (4 new tables), additive; rollback = drop
  the new tables (no existing table is altered except the Document Setup lock rule, which is code-only).
- Document Setup save changes: numbering rows that issued a number cannot be removed or edited
  (`DOCUMENT_SETUP_ROW_IN_USE`, 409). The Document Setup page shows them locked.
- nginx gains one location for `/api/v1/quotation/photos` → `api-master` (shared file, parent/infra edit).
- Bounds: ≤ 200 lines per quotation, ≤ 4 photos per line, list pages ≤ 50 rows (keyset), options ≤ 1,000
  rows. A save is one transaction of ≤ 10 batched statements. No new process, cache or job; the master
  service memory limit and DB pool are unchanged. Expected volume: thousands of quotations per year.

## Acceptance and approval

Covers this ADR and SA revision 1 in
[document/apps/backend/master/quotation/](../apps/backend/master/quotation/decisions.md)
(decisions, API contract, database diagram, sequence diagram) and the TODO
[document/task/todo/quotation.md](../task/todo/quotation.md). No new library.
Approved by the owner on 2026-10-26 ("อนุมัติ SA quotation rev 1"); evidence recorded in the header.
