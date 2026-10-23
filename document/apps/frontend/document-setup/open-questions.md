# Open questions: document-setup

- UI revision: 1 (pending-review). Each question has a proposed default (R) so the revision can be approved as written.

| ID | Question | Proposed default (R) | Affects |
|---|---|---|---|
| Q-DS-01 | Which transactions appear in the list, and is the list fixed? | Fixed list of transaction pages in GMS: Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale, Payable, Receivable. No create/delete; one setup per transaction. | C-01, C-02, API |
| Q-DS-02 | Is **Name** the title printed at the top of the document ("หัวกระดาษ")? | Yes: Name = document header title (e.g. "PURCHASE ORDER"); the drawer still shows the transaction's own label. | C-03, print |
| Q-DS-03 | What does **Start From** do exactly? | It is the default **Start No** for a new numbering row (and for the first row of a new setup). It does not change existing rows. | C-03, C-04 |
| Q-DS-04 | "Suffix" is described as the text **between** Prefix and number. Keep the label "Suffix", or rename to "Separator"? Should a real suffix (after the number) exist? | Behavior = separator between Prefix and number; label kept as "Suffix" with tooltip until you decide; no text after the number. | C-04, preview, API |
| Q-DS-05 | Pad the running number with zeros (e.g. `PO-000123`)? Fixed length? | No padding: the number is printed as is (`PO-123`, `PO-180001`). | preview, API |
| Q-DS-06 | Can a row that documents already used be edited or deleted? | No: once used (server flag `used`), its Date, Prefix, Separator and Start No are locked and it can't be removed; add a new row with a later Date instead. | C-04, API |
| Q-DS-07 | Permission | New catalog leaf `document-setup` under SETUP with VIEW + EDIT (no ADD/DELETE since the list is fixed). Needs SA + catalog change. | access, Setup tile |
| Q-DS-08 | Does numbering restart each year automatically? | No automatic reset; add a row dated 1 Jan (or any date) to restart. | rules |
| Q-DS-09 | Declaration: plain text only? Where is it printed? | Plain text with line breaks, up to 2,000 characters, printed at the bottom of the document (print layout is a later feature). | C-05 |
| Q-DS-10 | Is Code editable after documents were issued, and must it be unique? | Editable; unique across transactions. Changing Code does not change old document numbers. | C-03 |
