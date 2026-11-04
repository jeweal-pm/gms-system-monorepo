# Testing: purchase-order revision 1

| ID | Level | Check |
|---|---|---|
| UT-PO-01 | frontend unit | Route `/purchase/purchase-order` is a real page in navigation; access from `purchase-order:*` grants only. |
| UT-PO-02 | frontend unit | `PURCHASE_ORDER_KIND`: no From Stock button, no Stock ID column, Location shown and editable, Add row and empty-row click open the row panel, Duplicate shown. |
| UT-PO-03 | frontend unit | `canApprovePurchaseOrder`: saved + Pending Approval + not editing + not dirty + APPROVE; Approved is read-only; form ↔ API mapping (vendor, address, lines, photos). |
| UT-PO-04 | frontend unit | Error mapping: CHANGED, STATUS_INVALID, REFERENCE_INVALID field, `lines.N.*` → "Row N: …". |
| UT-PO-B01 | backend unit | Input schema: MANUAL only (`source: "STOCK"` and `memoStockId` rejected), `location` ≤ 40, 1–200 lines, photos ≤ 5. |
| GP-MT-PO | backend router | Each procedure needs its `purchase-order` action; other grants refused; mutations need CSRF. |
| IT-PO-01 | backend DB | Create → PENDING_APPROVAL with number (setup row and plain); update / delete only while pending; version conflict. |
| IT-PO-02 | backend DB | Approve → APPROVED, `purchased_*` = 0, outstanding = ordered; approve again → STATUS_INVALID; update / delete after approve refused; Document Setup row becomes used. |
| IT-PO-03 | backend DB | Totals server-side (line discount, document discount, tax, charges, labor); photos linked and replaced on update; a foreign photo id refused. |
| TC-PO-01 | manual | Create a PO with 2 typed rows and a photo, save, edit, approve; daybook dot turns green; the page is read-only. |
