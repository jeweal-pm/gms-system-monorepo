# Database diagram: memo-outstanding-customer (SA revision 1, approved 2026-11-03)

There is no schema change. The report reads these existing tables (`partner` schema):

```mermaid
erDiagram
  customer ||--o{ memo_out : "customer_id"
  memo_out ||--|{ memo_out_line : "memo_out_id"
  memo_stock ||--o{ memo_out_line : "memo_stock_id (From Stock)"
  memo_out {
    uuid id PK
    varchar status "APPROVED listed"
    varchar doc_no
    date doc_date
    date due_date
    uuid customer_id
    varchar customer_name_snapshot
    char3 currency_code
    numeric exchange_rate
  }
  memo_out_line {
    uuid id PK
    uuid memo_stock_id "NOT NULL = From Stock (listed)"
    varchar stock_id
    int pcs "Memo"
    numeric12_3 weight_ct "Memo"
    int returned_pcs "Return"
    numeric12_3 returned_weight_ct "Return"
    varchar price_unit
    numeric18_2 unit_price
    numeric18_2 amount "after line discount"
  }
```

- Outstanding = `pcs − returned_pcs` / `weight_ct − returned_weight_ct`. Sold is 0 until Sale exists.
- Index used: `memo_out_line_open_idx (memo_out_id) WHERE memo_stock_id IS NOT NULL AND (returned_pcs < pcs OR returned_weight_ct < weight_ct)`, which already exists. `memo_out_status_idx (status, doc_date desc, …)` serves the status and date filters.
