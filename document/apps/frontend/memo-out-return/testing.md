# Testing: memo-out-return

| ID | Level | What | Status |
|---|---|---|---|
| UT-MOR-01 | frontend unit | sidebar Memo Out Return → `/memo/memo-out-return`; `memo-out-return:VIEW` gates the page | revision 1 |
| UT-MOR-02 | frontend unit | `ReturnItemTable`: Pending and Return groups (Pcs, Weight), tinted Return, design empty-row text | revision 2 |
| UT-MOR-03 | frontend unit | Quotation item table default text unchanged; note limit 250 | revision 2 |
| TC-MOR-01 | browser (:8080) | layout matches source 01: Vendor/Address header, Memo Outstanding button, Pending/Return table, note 0/250; Save/Edit/Delete disabled | revision 2 |
| UT-MOR-B* / IT-MOR-* | backend + integration | save, numbering, memo out reference, partial return, stock | after the SA revision |
