# Open questions: currency

Each question has a default, applied in revision 1 (owner 2026-10-26: "ทำต่อเลย"). Answer one to change it in a new revision.

| ID | Question | Default applied |
|---|---|---|
| Q-CUR-01 | What is the base currency the rates use? | The Company Profile currency (the design shows THB as "Base currency" and rates as "1 = x THB"). |
| Q-CUR-02 | Must Code Name be an ISO 4217 code? | Exactly 3 letters A–Z (every stored currency column is 3 characters); not checked against the ISO list, so a custom code is allowed. |
| Q-CUR-03 | Can the base currency be inactive? | No: its Active switch is locked on. |
| Q-CUR-04 | Can Code Name change after saving? | No: vendors, customers and Company Profile store the code. Create a new currency instead. |
| Q-CUR-05 | When the company currency changes, are rates converted? | No conversion. The old base shows "Rates not set" until someone edits it. |
| Q-CUR-06 | Which currencies exist after the upgrade? | Every code already used by Company Profile, vendors and customers, plus THB and USD, all active, with no rates. |
| Q-CUR-07 | Which rate does a quotation use? | Selling Rate. Buying Rate is for purchase documents later. Changing a rate never changes saved documents. |
| Q-CUR-08 | Which permission? | New leaf `currency` in Master Code with the standard nine actions. The Quotation page reads options with `quotation:VIEW`. |
| Q-CUR-09 | Rate history by date? | Not in revision 1. One current rate per currency. |
