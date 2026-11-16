# Location Master — backend testing (SA revision 1)

| ID | Level | Checks |
|---|---|---|
| UT-LM-B01 | unit | schemas: trimmed name 1–40, strict inputs, limit 1–50, q ≤ 100 |
| UT-LM-B02 | unit | router grants: VIEW / ADD / EDIT / DELETE, CSRF on mutations, Super Admin |
| UT-LM-B03 | unit | errors: taken (P2002), not found, changed (version), unavailable |
| UT-LM-B04 | unit | PO / Purchase validation: active name ok (stored in master spelling), stored value kept, inactive / unknown refused with `lines.i.location`, copied lines not checked, blank ok |
| IT-LM-B01 | DB (disposable PostgreSQL) | migration creates table + unique lower(name); backfill takes distinct trimmed PO / Purchase names, skips blank, > 40 and `Memo` is not added |
| IT-LM-B02 | DB | list paging and search, create / update / delete with versions, concurrent duplicate create → one wins |
| IT-LM-B03 | DB | `purchaseOrder.options` / `purchase.options` return active names only, sorted, ≤ 500 |
