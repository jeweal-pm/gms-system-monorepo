# SA decisions: memo-out + memo-out-return, SA revision 1 (2026-10-28)

- Features: `memo-out` (UI rev 1, [ui-spec](../../../frontend/memo-out/ui-spec.md)) and `memo-out-return` (UI rev 2, [ui-spec](../../../frontend/memo-out-return/ui-spec.md))
- Status: **implemented**.
  - Owner 2026-10-28: "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย" (direct instruction).
  - Party answer the same day: "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor".
  - Other open questions use the defaults in each feature's open-questions file.
- ADR: [ADR-0033](../../../../adr/0033-memo-documents-in-master-service.md). Contract: [api-contract.md](api-contract.md).
- Service: `backend-api-master`, schema `partner`. No new service, container, volume, nginx route or package.

| ID | Decision |
|---|---|
| SA-MO-01 | Tables `memo_out`, `memo_out_line`, `memo_out_charge`, `memo_out_return`, `memo_out_return_line`, `memo_out_return_charge`, migration `20261028090000_memo_out`. Shaped like the quotation tables, without photo, reason or approval columns. CHECKs: status DRAFT, due ≥ doc date, rates, line values. |
| SA-MO-02 | Permissions: existing leaves `memo-out` / `memo-out-return`. VIEW = list/get/nextNumber/options; ADD = create; EDIT = update; DELETE = delete. `MasterMenu` gains both; `currency.options` is readable with either. |
| SA-MO-03 | Status DRAFT only (no approval, Q-MO-01/Q-MOR-07). Update and delete need a draft, else `<CODE>_STATUS_INVALID` (409). |
| SA-MO-04 | Numbers from Document Setup keys `memo-out` / `memo-out-return`: the row in effect on the doc date is locked; next number = max running no for that row + 1 (or start no); no row → plain 1, 2, 3 … under an advisory lock per document type. `nextNumber` previews it. Document Setup `used` = referenced by a quotation, memo out or memo out return. |
| SA-MO-05 | Party: Memo Out = active customer (or the stored one) with a SHIPPING and an INVOICE address of that customer. Memo Out Return = active vendor (or the stored one) with one of its addresses. Snapshots store code, name and formatted address text. |
| SA-MO-06 | Header, lines and totals as quotation (SA-QT-06/07/08): currency active or stored; exchange rate required for a foreign currency; ≤ 200 MANUAL lines; server-computed totals. Lines may not carry photos (`photoIds` max 0). |
| SA-MO-07 | Optimistic `version`; mismatch → `<CODE>_CHANGED` (409); missing → `<CODE>_NOT_FOUND` (404); bad party/address/currency/stone code → `<CODE>_REFERENCE_INVALID` (422, field named). `<CODE>` = `MEMO_OUT` or `MEMO_OUT_RETURN`. |
| SA-MO-08 | One shared engine (`src/trade-document/document-engine.ts`) with a party adapter per document (`memo-out.service.ts`, `memo-out-return.service.ts`). Log events `memo_out.*` / `memo_out_return.*` (ids and doc no only). |
| SA-MO-09 | Lists: keyset `(doc_date desc, created_at desc, id desc)`, ≤ 50, search doc no / party name / ref, optional `partyId`, date range. Options: `memoOut.options` has the `quotation.options` shape (customers, currencies, company currency, charge types, numbering, stone lists); `memoOutReturn.options` lists vendors with addresses instead of customers. |
| SA-MO-10 | Not in revision 1: stock posting (inventory, ADR-0027), line photos, From Stock, Memo Outstanding source for returns. |
