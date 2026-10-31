# Open questions: memo-outstanding-vendor (UI revision 1 / SA revision 1, approved 2026-10-29)

Owner answers 2026-10-29: Q-MOV-02 explained and Q-MOV-04 answered (below); "นอกนั้นถูกหมด" confirms every other default. These are answers, not approval.

| ID | Question | Answer / default (confirmed 2026-10-29) |
|---|---|---|
| Q-MOV-01 | The title says "From Vender". | Typo: show **"From Vendor"**. |
| Q-MOV-02 | Which documents are listed? | **Approved** Memo Receive documents that still have Reserve or Outstanding above 0. Fully settled documents are hidden. Pending-approval documents are hidden, because they have no Memo Stock yet. **Owner 2026-10-29**: every item obeys **Return + Sold + Reserve + Outstanding = Memo**, for both pcs and weight ("อันเเรกนำเข้ามา4 return ไป 1 sold ไป 2 reserve ไป 1 รวมเป็น 4 … รวมกันต้องได้ memo"). The document row sums its items. Default listing confirmed ("นอกนั้นถูกหมด"). |
| Q-MOV-03 | What does the date range "Start → Due" filter? | Memo Receive **Doc Date** from–to, the same as the Add Memo Stock dialog (Q-MR-10). |
| Q-MOV-04 | What do Return, Sold and Reserve count? The design's Customize panel says "PO/Purchase" where the table says "Sold". | **Answered 2026-10-29: "Sold"**. The panel follows the column headers in order: Memo, Return, **Sold**, Reserve, Outstanding, Price ("เรียงตามหัวคอลัมเลยจริงเป็น sold"). Feeds (default, confirmed): Return = Memo Return approved; Sold = Sale approved; Reserve = Reserve or Memo Out approved. All 0 today. |
| Q-MOV-05 | Grand total currency: documents use different currencies, and the design shows "(USD)". | Convert each open value to the **company currency** with that document's exchange rate (1 doc currency = rate × company currency; a document in company currency uses 1), and label the card "Grand total (THB)", or whatever the company currency is. |
| Q-MOV-06 | The design's item rows show no Stock ID, and Customize has "Stone Code", but Memo Receive has no Stone Code. | Show **Stock ID · Lot** on item rows, with the toggle "Stock ID · Lot" replacing "Stone Code". |
| Q-MOV-07 | Who sees prices? | Same as the memo documents: every user with VIEW sees Price and Grand total. A PRICE gate is not in this revision. |
| Q-MOV-08 | Excel export? | **Not in this revision**. The button shows as unavailable, as on other pages. Print works. |
| Q-MOV-09 | The doc row in [07](source/07-item-rows-show-selected.png) shows Reserve 0 and Outstanding 3 / 8.95, but its items sum to Reserve 3 / 8.95 and Outstanding 0. | Treated as sample-data noise: the **document row is always the sum of its items**. |
