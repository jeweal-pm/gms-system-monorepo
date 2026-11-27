# Stock Adjustment — manual user check

- Feature: `stock-adjustment`, UI revision 1 / SA revision 1
- Related TODO: `FE-SAJ-001…009`, `BE-SAJ-001…008` in [stock-adjustment TODO](../../task/todo/stock-adjustment.md)
- Date: 24 November 2026
- Result: **Not run — the GMS web page was unavailable**

## What I checked

I checked whether the local GMS page was available at `/inventory/stock-adjustment`. The GMS frontend container was stopped (`Exited (1)`), and the GMS nginx container was also stopped. Port 3000 was occupied by another local project (`faroai-api`), so opening the expected local page there would not reach GMS. The inventory API had restarted and was healthy; the master API was still starting when checked. I did not sign in or make changes to shared stock or documents.

## Customer-flow checks not run

Because the GMS page could not be opened, I could not try the page as a customer. These checks remain unverified:

- Open the Stock Adjustment page and confirm the number preview, status, five empty rows, and disabled Print / Excel / Duplicate actions.
- Try From Stock before choosing a Main Location; choose a location and confirm only own stock with a positive balance appears.
- Add a row, enter physical quantities and price, inspect the calculated difference, then try incomplete input and verify the save feedback.
- Change Main Location with picked rows and verify the confirmation and row clearing.
- Exercise Save / Send to approve and Approve Center flows, including the stock-changed message.
- Confirm that a zeroed lot disappears from From Stock, and that Stock Card / Stock Value reflect an approved adjustment.

No user-visible pass or failure is claimed from this run. These items require the GMS frontend and nginx to be running on a non-conflicting local port, then a browser session with an authorized test account and safe test stock data.
