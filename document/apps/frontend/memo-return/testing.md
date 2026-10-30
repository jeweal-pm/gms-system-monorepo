# Testing: memo-return

## Automated

| ID | Where | Covers |
|---|---|---|
| UT-MRT-01 | `frontend/test/memo-return/memo-return.test.ts` | sidebar link, routes, `memo-return` permission leaf |
| UT-MRT-02 | same | item table edit mode: design headers, checkbox / remove / Add row, only Return inputs; view mode: Stone Code first, text only |
| UT-MRT-03 | same | Memo Stock row → return row (Return 0 / 0.00, Outstanding, source line); picked rows left out of the picker |
| UT-MRT-04 | same | vendor + address required, Return > 0 and ≤ Outstanding, note ≤ 250 |
| UT-MRT-05 | same | contract input (source line, Return, empty rows dropped) and saved document mapping |
| UT-MRT-06 | same | `MEMO_RETURN_*` errors |
| UT-MRT-07 | same | "Memo Return Details" view card |
| UT-MR-B01…B05 | `backend-api-master/test/trade-document/memo-documents.test.ts` | memo receive numbering + vendor snapshot; `MEMO_RECEIVE_IN_USE`; return lines completed from the memo receive line under a row lock, Outstanding = received − returned elsewhere; rejections (over Outstanding, other vendor / currency, missing, duplicate); Memo Stock filters and pending |
| UT-MR-B06 | `backend-api-master/test/document-setup/document-setup.service.test.ts` | a memo return number marks the Document Setup row used |
| GP-MT-MR | `backend-api-master/test/master/router.test.ts` | exact grants, CSRF on writes, strict inputs, `memoStock` permission |

## Live check (TC-MRT-01, 2026-10-29, nginx :8080)

1. Created a memo receive through the API (V001, THB, 3 lines: 10 / 3.20, 6 / 2.94, 2 / 1.36).
2. Opened `/memo/memo-return`. The number preview was "1" (no Document Setup row for Memo Return yet). Memo Stock before choosing a vendor showed "Choose a vendor first".
3. Chose V001 and opened Memo Stock: 3 rows with Pending and amounts. Selected all and pressed OK. The toast read "Added 3 items from Memo Stock" and the rows filled the empty rows.
4. Typed Return Pcs 7 / 4 / 2. The weights filled to 2.24 / 1.96 / 1.36.
5. Saved. The page moved to `/memo/memo-return/<id>` in view mode with the Memo Return Details card, Stone Code first and no inputs. The API returned the same quantities, Outstanding 10 / 6 / 2 and grand total 76,528.00.
6. Memo Stock afterwards showed 3 / 0.96 and 2 / 0.98 still out. The fully returned line was gone. Deleting the memo receive gave `MEMO_RECEIVE_IN_USE`.
7. Edit with Return Pcs 11 (> 10): the form blocked the save with "More than outstanding".
8. Deleted the test memo return and the memo receive.
