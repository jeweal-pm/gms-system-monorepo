# ADR-0033: Memo Receive page — frontend only; existing master APIs, mock documents

- Status: Accepted (revision 1, 2026-10-28)
- Date: 2026-10-28
- Feature / source UI revision: `memo-receive` / 1
- SA revision: none (no API, schema or service change in this revision)
- Deciders: project owner
- Approval evidence: owner 2026-10-28, answers to Q-MR-01…07 and "ตอนนี้เเค่ทำ UI mock data พอยังไม่ต้องต่อ api จริง หรือ คิดว่าสามารถต่อกับ api จริงตัวอื่นก่อนได้ก็ต่อเลย เช่น stonemaster stone vendor document master currency เเค่ยังไม่ต้องทำของ memo receive"
- Supersedes / related ADRs: [ADR-0025](0025-quotation-frontend.md) (Quotation frontend structure, reused), [ADR-0032](0032-quotation-backend-in-master-service.md) (Quotation backend, not used here), [ADR-0019](0019-vendor-master.md) §4 (vendor snapshot rule for the future Memo backend)

## Context

Owner request 2026-10-28: "ออก adr หน้า ทำตาม design memo receive ให้หน่อย ยังไม่ต้องต่อหลังบ้าน ข้อมูลขอเป็น mock ให้หมดก่อน
เพราะยังไม่มี flow เกี่ยวกับหน้านี้ว่าทำอะไรบ้าง STOCK ID จะคีย์ไม่ได้ จะเป็น Running ไม่สามารถกรอกข้อมูลเองได้ เพราะระบบจะรันหมายเลขให้อัตโนมัติ (Running Number)".
Follow-up the same day: existing master APIs may be connected; nothing is built for Memo Receive itself.

Memo Receive records stones received **on memo (consignment) from a vendor**. The design
([source](../apps/frontend/memo-receive/source/01-memo-receive-design.png)) uses the Quotation layout:
header with number and actions, info form, item table + row panel, document note, Summary Value and
right rail. The business flow after receiving (stock, return, payable) is not defined yet.

Today the sidebar item "Memo Receive" opens the generic `/modules/memo-receive` placeholder. The
`memo-receive` permission leaf already exists in the auth catalog, and Document Setup already lists a
`memo-receive` transaction (default code `MR`).

UI spec: [ui-spec.md](../apps/frontend/memo-receive/ui-spec.md); answers:
[open-questions.md](../apps/frontend/memo-receive/open-questions.md); TODO:
[memo-receive.md](../task/todo/memo-receive.md).

## Decision

1. **Frontend only; real master data, mock documents.** No backend, API, database, migration or
   permission catalog change. The page reads the **existing** master APIs: vendors and their
   addresses (`vendor.list`, `vendor.get`), currencies and rates (`currency.options`), stone attributes
   (`stoneMaster.options`; no stone codes since revision 2) and numbering
   (`documentSetup.get` for `memo-receive`). Each call keeps its own permission (vendor, currency or
   quotation, stone-master, document-setup VIEW); a user without it sees a short message on that field,
   never mock data in its place. Mock: the location list and the Memo Receive documents themselves,
   kept in memory and in this browser's `localStorage` (`gms.memo-receive.v1`, validated on read,
   bounded to 200 documents of ≤ 100 lines). Photos are kept in memory only for the session (object
   URLs, not uploaded). All access goes through `features/memo-receive/api.ts`, so the Memo Receive API
   revision changes only that file.
2. **Route and menu.** `/memo/memo-receive` (new) and `/memo/memo-receive/[id]` (view/edit), added to
   `REAL_PAGE_HREFS` so the sidebar item opens the real page. Gate: the existing `memo-receive`
   permission (VIEW to open; ADD/EDIT/DELETE for the buttons).
3. **Stock ID is a running number, never typed.** Each item line gets a Stock ID when the document is
   saved. In the row panel the Stock ID is read-only: "Auto" with the hint "Assigned when you save"
   before saving, the number after. One counter for all Memo Receive lines, plain 1, 2, 3 … (Q-MR-01);
   a deleted document does not give its Stock IDs back.
4. **Document number from Document Setup, like Quotation** (Q-MR-02): the `memo-receive` numbering row
   in effect on the Doc Date gives prefix + separator + running (its start number, then the highest
   mock number for that row + 1); with no row in effect the number is plain 1, 2, 3. Numbers are issued
   by the mock in this browser, so they are unique only per browser until the backend exists, and
   Document Setup does not lock rows used by mock documents.
5. **Reuse Quotation components through a document-kind setting, no copy.** The item table, row panel,
   photo field, Summary Value and document note in `features/quotation` read an optional `DocumentKind`
   React context (Stock ID mode, Stone Code shown or not, location list, note
   length and hint, photo upload). Its default is exactly today's Quotation behaviour, so the Quotation
   page does not change. Memo Receive provides its own setting and keeps its header, info form, daybook,
   schema and data access in `features/memo-receive`. Lines use the Quotation line shape.
6. **Totals.** Same rules and rounding as Quotation (half-up, 2 dp): line amount = (weight or pcs, by
   Price Unit) × Sale Price − line discount; Subtotal; document Discount; Tax (rate %, optional "Include tax in price"); Other Charge
   (service charges, labor); Grand Total. Revision 2 (owner 2026-10-28): Quantity & Price, line and
   document discounts exactly as Quotation, and **no Stone Code** — the Stock ID leads the table row and
   the row panel title.
7. **Approval on the future Approve page** (Q-MR-05): saving sets **Pending Approval** (orange badge);
   the document can be edited and deleted until it is approved. The Approve page doesn't exist yet, so
   nothing becomes Approved in revision 1; an Approved document would be read-only.
8. **Out of scope:** From Stock (stones come from the vendor), Print/Excel (disabled), stock posting,
   memo return, payable, the Approve page, a location master, the vendor snapshot rule (ADR-0019 §4,
   for the backend revision).

## Alternatives

| Option | Why not chosen |
|---|---|
| Build the Memo Receive backend now (like ADR-0032) | The owner asked for no Memo Receive backend yet; the business flow is not defined. |
| Mock every list, including vendors and stones | The owner allowed connecting the existing master APIs; real lists avoid a second migration of the UI later. |
| Copy the whole Quotation feature folder | Two copies of the same table, panel, photo and summary code would drift. |
| Generalise Quotation into one "document page" component now | Large refactor of a delivered page before the second document's flow is known; the context keeps the change small. |
| Let the user type Stock ID | The owner requires an automatic running number. |

## Consequences and capacity

- No server, database or container change; no new dependency. Master reads are the same bounded calls
  other Setup pages already make (vendor list ≤ 50 per page, options cached 60 s).
- Mock documents live only in the browser: other users and devices don't see them; clearing site data
  removes them. The page shows a short "Preview" note so nobody mistakes them for real records.
- A user needs VIEW on vendor, stone master, document setup and currency (or quotation) to use every
  field; the Memo Receive API revision should provide one `memo-receive`-gated options call, as
  `quotation.options` does.
- `localStorage` is bounded and parsed defensively; invalid stored data is ignored.

## Acceptance and approval

- Sidebar "Memo Receive" opens `/memo/memo-receive`; layout matches the design; Stock ID can't be typed
  and is filled on save; status Pending Approval after save; totals follow Decision 6; Quotation behaves
  as before; data survives a refresh in the same browser; frontend tests, typecheck and lint pass.
- Covers: this ADR, [ui-spec](../apps/frontend/memo-receive/ui-spec.md),
  [open-questions](../apps/frontend/memo-receive/open-questions.md), [TODO](../task/todo/memo-receive.md).
- Approved by the owner 2026-10-28 (evidence in the header).
