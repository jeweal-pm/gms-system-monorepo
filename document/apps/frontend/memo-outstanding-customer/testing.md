# Testing: memo-outstanding-customer (revision 1)

| ID | Level | What |
|---|---|---|
| UT-MOC-B01 | backend unit | Input bounds: q ≤ 100, customerIds ≤ 50, date range (`before_from`, `range_too_long`), pageSize, the sort whitelist (no `reservePcs` / `vendorName`), and memoOutIds 1–25 |
| GP-MT-MOC | router | Every `memoOutstanding.customer*` procedure needs `memo-outstanding-customer:VIEW`. `memo-outstanding-vendor:VIEW` alone is refused, and the input is strict. |
| IT-MOC-01…03 | DB integration (disposable PostgreSQL) | 1. An approved Memo Out is listed with Memo = Outstanding. A pending one is not listed.<br>2. A Memo Out Return approval moves the quantity into Return and lowers Outstanding and the open value. A fully returned Memo Out leaves the list and the summary.<br>3. Summary KPIs, grand-total conversion, filters (q, customer, dates), sort and paging; items sum to their document; options list customers with approved Memo Outs. |
| UT-MOC-01…03 | frontend unit | 1. Report config: route, nav link, access leaf, labels, buckets without Reserve, sort keys, storage keys separate from Vendor.<br>2. The customer adapter maps the contract to report rows and items (Reserve 0, document link to Memo Out).<br>3. URL state ignores vendor-only sort keys. |
| Existing UT-MOV-* | frontend unit | From Vendor tests stay green after the shared refactor |
| TC-MOC-01 | browser (:8080) | Approved Memo Out → shown on From Customer. Approve a Memo Out Return for part of it → Return and Outstanding change. Expand, print and customize work. |
