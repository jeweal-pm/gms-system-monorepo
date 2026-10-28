# Testing: memo-out

| ID | Level | What | Status |
|---|---|---|---|
| UT-MO-01 | frontend unit | sidebar Memo Out → `/memo/memo-out`; `memo-out:VIEW` gates the page | revision 1 |
| UT-MO-02 | frontend unit | shared header renders the "Memo Out No.:" label and its Create New link; Quotation defaults unchanged | revision 1 |
| TC-MO-01 | browser (:8080) | page layout matches source 01; Save/Edit/Delete disabled with the preview notice; From Stock disabled; rail Summary and empty Daybook | revision 1 |
| UT-MO-B* / IT-MO-* | backend + integration | save, numbering, references, stock | after the SA revision (FE-MO-002…004) |
