# Customer check: whole GMS system (2026-11-02)

- Request: owner 2026-11-02, "สามารถ manual tester ทั้งระบบเท่าที่มีตอนนี้เลยได้ไหมว่า พบปัญหาอะไรมั้งเปิด INV มา"
- Tester role: `manual-tester` (customer view: 20 years in jewelry ERP). Report scope: `manual-test-reports` (`document/testing/user-check/**`). INV records were written to `document/task/investigation/` at the parent's request.
- Build tried: branch `feat/02-11-26-manual-tester`, commit `4753205`, clean tree. Local dev stack at `http://localhost:8080` (Next.js dev mode, so the first open of a page can be slow while it builds).
- Browser: Chrome (headless) driven by a script, desktop 1440×900, plus one check at 1280×800.
- Accounts: the local demo admin, the local demo user, and one test user I created (`mt-tester01`). No passwords are written here.
- Screenshots: [artifacts/2026-11-02-full-system/](artifacts/2026-11-02-full-system/)

## Summary

The main memo flow works from start to finish. I received stones from a vendor, sent some out to a customer, took part of them back, returned some to the vendor, and the Memo Outstanding › Vendor report matched in every column. Approvals, permissions and most required-field messages behave as I would expect.

The biggest problem is that the system **throws me back to the login screen after a normal burst of clicking**. It happened four times during the session. I was not really logged out: after waiting about a minute, the same login worked again. In a shop where several people share one internet connection, this would happen even more often.

| Area | Result |
|---|---|
| Login, logout menu, profile password change | Pass |
| Session stays open during normal work | **Fail**: [INV-20261102-001](../../task/investigation/INV-20261102-001-session-check-throttle-forces-login.md) |
| Sidebar, Home shortcuts, placeholder menus | Pass (small wording note) |
| Setup: Company Profile, Currency, Customer, Vendor, Decimal, Document Setup, Stone Master (9 sub-pages), User Permission | Pass for opening, empty-save checks and creating a user |
| Quotation (new, save) | Pass |
| Memo Receive (save, approve, Stock IDs, delete pending) | Pass |
| Memo Out (From Stock only, partial qty, save, approve) | Pass, but the save error doesn't show which line is wrong: [INV-20261102-003](../../task/investigation/INV-20261102-003-item-row-errors-not-shown-on-save.md) |
| Memo Out Return (customer, addresses, Memo Outstanding, Return ≤ Outstanding, approve, conflict) | Pass with problems: [INV-20261102-002](../../task/investigation/INV-20261102-002-memo-out-return-quantities-not-prefilled.md), [INV-20261102-003](../../task/investigation/INV-20261102-003-item-row-errors-not-shown-on-save.md) |
| Memo Return to vendor (save, approve) | Pass |
| Memo Outstanding › Vendor (numbers, expand, search, resize, refresh) | Pass for the numbers. One price looks wrong: [INV-20261102-004](../../task/investigation/INV-20261102-004-outstanding-report-unit-price-four-decimals.md) |
| Permissions (user without grants, user without Approve) | Pass |
| Exchange Rate field | Small display problem: [INV-20261102-005](../../task/investigation/INV-20261102-005-exchange-rate-label-question-mark-overlap.md) |
| Layout at desktop width | Pass at 1440. Crowded at 1280 with the row panel open (part of INV-20261102-005) |

## What I did and what worked

### Login, profile, navigation

- Logged in as the admin and as the demo user. Both landed on Home with the shortcut cards.
- The account menu (avatar) shows the username, Settings, User and permission, and Sign out.
- Settings › Profile, password change:
  - Empty → "Please enter your current password" and "At least 4 characters".
  - Different new passwords → "Passwords don't match".
  - Wrong current password → "Current password is incorrect". I stayed logged in.
- I clicked every sidebar item that is not built yet (Dashboard, Approve, Reserve, Purchase Order, Purchase, Purchase Outstanding, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Barcode Printing, Sale, Memo Outstanding › Customer, report sub-menus). Each shows a clear "not available yet" page with Back to Home.
- An unknown page address shows a normal "404 This page could not be found."

### Setup

- Every Setup page opened: Company Profile, Currency, Customer, Vendor, Decimal Setup, Document Setup, and Stone Master (Stone Group, Stone Name, Size, Shape, Color, Cutting, Clarity, Quality, Stone Code).
- Pressing Save on an empty new Customer, Vendor or Currency lists every missing field in plain words, for example "Name is required", "Currency is required", "Enter 3 letters, e.g. USD", "Rate is required".
- Decimal Setup says clearly that its settings are only a preview kept in this browser.
- Document Setup lists all transactions. Memo Return, Memo Out and Memo Out Return are "Not set up", so their numbers are plain 2, 3, 4 without a prefix. That is expected from the setup, not a fault.
- User and Permission:
  - Empty Save → "Username is required", "Password is required", "Name is required", "Location is required".
  - I created `mt-tester01` with Memo Receive View/Add/Edit and Memo Out View only. The counter read "4 of 358 permissions on" and the user was created.

### Main memo flow (all as the admin unless noted)

1. **Memo Receive**
   - Empty Save → red "Required" on Vendor, Address and Due Date, "Add at least one item", and the toast "Please complete the required fields". Good.
   - With a Due Date before the Doc Date → "Due date must be on or after doc date". Good.
   - I made MR-2 (ref MT-MR-001) from vendor V001 in AED with two lines:
     - Diamond, 10 pcs, 5.125 ct at 1,234.50 per ct = 6,326.81.
     - Ruby, 3 pcs, 1.5 ct at 1,000 per pcs less 10% = 2,700.00.
     - Totals and Grand Total 9,026.81 AED were right.
   - After Save the lines got Stock IDs 260006 and 260007, and the status was Pending Approval.
   - Approve asked "Approve this Memo Receive? Its 2 items move to Memo Stock and it can no longer be edited." After approval the status was Approved, and Edit and Delete were gone.
2. **Memo Out**
   - There is no Add row. Clicking an empty row opens From Stock. From Stock listed 260006 and 260007 "from MR-2 · V001" with the pending quantities.
   - "Added 2 items from Stock" appeared. Rows from stock are read-only except quantity, price, discount and note.
   - 11 pcs on a 10-pcs item → "More than pending". 4 pcs filled the weight 2.05 automatically (5.125 × 4 ÷ 10).
   - Saved Memo Out 2 (ref MT-MO-001, THB): 4 pcs of 260006 at 5,000 per ct and 3 pcs of 260007 at 30,000 per pcs, Grand Total 100,250.00 THB. Then I approved it.
3. **Memo Out Return**
   - Choosing the customer filled the Shipping and Invoice addresses and the currency (THB).
   - Without a customer, the Memo Outstanding button shows "Choose a customer first".
   - In AED, the dialog says "Nothing outstanding for this customer in AED."
   - In THB, the Memo Outstanding dialog listed the items lent out, with Memo Out No., Outstanding and price.
   - I returned 2 pcs / 1.025 ct of 260006 and all 3 pcs of 260007 as MOR 2 (ref MT-MOR-001), total 95,125.00 THB. Approve put them back to pending.
   - **Conflict check:** I saved two returns (MT-MOR-RACE-A and MT-MOR-RACE-B) for the same last 2 pcs and approved B. Approving A then showed "Some items were already returned by another document. Edit the Return quantity and approve again." A stayed Pending Approval. Very good. I then deleted A.
4. **Memo Return to vendor**
   - In AFN, the vendor's default currency, the Memo Stock dialog says "No memo stock from this vendor in AFN." In AED it listed 260006 (8 pending, because 2 were still out with the customer at that time) and 260007.
   - Returned 3 pcs. The weight filled itself as 1.54 ct. Saved and approved Memo Return 2 (ref MT-MRT-001), 1,901.13 AED.
5. **Memo Outstanding › Vendor**
   - MR-2 row: Memo 13 pcs / 6.63 = Return 3 / 1.54 + Sold 0 + Reserve 2 / 1.03 + Outstanding 8 / 4.06. MR-1 row: 30 = 10 + 0 + 5 + 15. Both add up.
   - Open value 7,125.68 AED and the KPI Grand total 18,125.68 AED are correct.
   - Expanding MR-2 shows both items with their own numbers.
   - The search "MR-2" filtered the list.
   - Dragging the Vendor Name column widened it from 150 to 296 px. Refresh put it back to 150 px and reloaded.

### Permissions

- Demo user (Customer and Vendor rights only):
  - The sidebar shows only Home, Dashboard, Setup and Approve.
  - Opening memo or quotation addresses directly shows "You don't have permission to view …".
  - User and Permission shows "You don't have access to User and permission", with an explanation and Back to Home.
- `mt-tester01`:
  - The sidebar shows only Memo Receive and Memo Out.
  - I could create a Memo Receive (MR-3, ref MT-MR-PERM). It had **no Approve button**, and Delete was disabled.
  - Memo Out was view-only: Save was disabled.
  - Then, as the admin, I deleted MR-3. The browser asked "Delete MR-3?" and the document was gone.

### Opening documents that don't exist

- `/memo/memo-out/<unknown>` → "This memo out no longer exists."
- A deleted memo receive address showed the not-found state after deletion.

## Problems found

### 1. Thrown back to the login screen after normal clicking (high) — [INV-20261102-001](../../task/investigation/INV-20261102-001-session-check-throttle-forces-login.md)

- Starting point: logged in as the admin, working normally.
- Steps:
  1. Open the sidebar pages one after another, or refresh pages. About 15 page opens or 30 menu clicks within one minute is enough, counted across everyone using the same computer or connection.
- Expected: I stay logged in.
- Actual: the next page opens the **Log in** screen. Anything not saved on the page is lost.
  - Logging in again also fails until about a minute has passed with no clicks.
  - Then the old login works again, so I was never really logged out.
- Seen 4 times in this session (see `auth-01-kicked-to-login.png`).

### 2. Memo Out Return: Return quantities start empty (medium) — [INV-20261102-002](../../task/investigation/INV-20261102-002-memo-out-return-quantities-not-prefilled.md)

- Steps:
  1. New Memo Out Return, then choose the customer.
  2. Open Memo Outstanding, tick two items, and press OK.
- Expected: the Return Pcs and Weight start at the outstanding amount, so returning everything is just Save.
- Actual: both start empty, showing 0 and 0.00, and the Amount is 0.00. Typing the Pcs does **not** fill the Weight, while Memo Out and Memo Return do fill it. I had to type every Pcs and every Weight by hand.

### 3. Save error doesn't show which item line is wrong (medium) — [INV-20261102-003](../../task/investigation/INV-20261102-003-item-row-errors-not-shown-on-save.md)

- Memo Out:
  1. Pick two items from stock without a sale price, then Save.
  2. Only the toast "Please complete the required fields" appears. The table shows nothing red.
  3. I had to open each row to find "Enter the sale price".
- Memo Out Return:
  1. Fill the Return Pcs of one row but not its Weight, and leave the second row empty. Save.
  2. The same toast appears, with nothing marked in the table.
- Memo Out Return and Memo Return: typing more than outstanding turns the box red, but no words such as "More than outstanding" appear in the table.

### 4. Memo Outstanding shows a strange unit price (low) — [INV-20261102-004](../../task/investigation/INV-20261102-004-outstanding-report-unit-price-four-decimals.md)

- Steps:
  1. Memo Outstanding › Vendor, then expand MR-2.
- Expected: the diamond line shows the price I entered, **1,234.50 AED** per ct. Memo Return shows it that way.
- Actual: it shows **1,234.4995 AED**, with four decimals and a value I never typed.

### 5. Exchange Rate field is confusing and crowded (low) — [INV-20261102-005](../../task/investigation/INV-20261102-005-exchange-rate-label-question-mark-overlap.md)

- With a foreign currency, the label reads literally "Exchange Rate (1 THB = ? AED)" next to the value 35.0000. The "?" looks like the rate is unknown.
- On Memo Receive with the item panel open, the label wraps over the value at 1440 px. At 1280 px the Vendor box shows only "Select…", and the item table shows only the Stock ID column.

## Smaller notes (no ticket; for the owner to judge)

- **Weights** in tables show 2 decimals, for example 5.13 for 5.125 ct. The panel shows 5.125. Jewelry users usually want to see the 3rd decimal for diamonds. This is the current rule in the design.
- **Delete** uses the browser's plain OK/Cancel box ("Delete MR-3?"), while Approve uses the system's own dialog. No "deleted" message appeared after deleting.
- An unknown menu address (`/modules/xyz-not-exist`) shows "Menu not found" and also "This menu is part of the system layout…". The two sentences contradict each other.
- **Quotation:** the empty row says "click to key in, or use From Stock to fill it", but the From Stock button is disabled.
- **Memo Outstanding dialog** (Memo Out Return) shows dates as 2026-11-02. Everywhere else they read 02/11/2026.
- **After the first Save** of a new Memo Receive, for a few seconds the page still showed the new form, an active Save button and the next preview number (MR-3) before it switched to MR-2. This is probably the slow dev build. I did not click Save twice to see whether a duplicate is made.
- **Document Setup › Quotation** has an upcoming row (25/11/2026) that restarts at QT-22 with the same QT prefix, while QT-27 and QT-28 already exist. Restarting is allowed by design. I did not test what happens when the running number reaches QT-27 again.
- **Stock IDs are skipped** (260004, 260005, 260008). 260008 was used by a memo receive I then deleted. This matches the existing [INV-20261029-002](../../task/investigation/INV-20261029-002-memo-receive-stock-id-exhaustion.md).
- The login screen shows the demo usernames and passwords. That is fine for local work, but it must not reach a real site. I did not check a production build.
- Vendors V001 and V002 are both named "Org", which makes the vendor filter hard to use. This is test data, not a fault.

## Existing tickets touched

- [INV-20261029-001](../../task/investigation/INV-20261029-001-memo-out-return-outstanding-columns-missing.md): Memo Out Return **saved and approved fine** on this database today (MOR 2 and 4). This may already be fixed. For the owner to confirm.
- [INV-20261029-002](../../task/investigation/INV-20261029-002-memo-receive-stock-id-exhaustion.md): see the skipped Stock IDs above.
- INV-20261029-003, -004 and INV-20261031-002: not reproduced. My data was small and I had a single user.

## Not run

- Photos on memo or quotation lines: no upload was tried, to keep files out of shared storage.
- Print, Excel and Duplicate: these are disabled in the build.
- Company Profile and Document Setup edit and save, and Currency, Customer, Vendor and Stone Master create: I avoided changing shared setup data. Only the empty-save messages were checked.
- Real multi-user use from different computers. The session problem was seen with one tester on one machine.
- Mobile and tablet layouts: only desktop widths were requested.
- A production build: everything was tested on the dev stack.

## Test data created

All of it is in the local dev database. Approved documents can't be deleted from the screens.

| Item | Reference | State |
|---|---|---|
| Memo Receive MR-2 | ref MT-MR-001, lots MT-LOT-A / MT-LOT-B, Stock IDs 260006, 260007 | Approved |
| Memo Receive MR-3 | ref MT-MR-PERM (made by mt-tester01), Stock ID 260008 | Deleted from the screen |
| Memo Out 2 | ref MT-MO-001 | Approved |
| Memo Out Return 2 | ref MT-MOR-001 | Approved |
| Memo Out Return 4 | ref MT-MOR-RACE-B | Approved |
| Memo Out Return 3 | ref MT-MOR-RACE-A | Deleted from the screen |
| Memo Return 2 | ref MT-MRT-001 | Approved |
| Quotation QT-28 | ref MT-QT-001 | Saved |
| User | `mt-tester01` (name "MT- Tester"), Memo Receive View/Add/Edit, Memo Out View | Active |

Effect on Memo Stock after the run:

- 260006: 10 pcs received, 3 returned to the vendor, 0 out, 7 pending.
- 260007: 3 pcs, all pending.
