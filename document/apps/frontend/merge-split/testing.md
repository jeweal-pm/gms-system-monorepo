# Testing: merge-split (UI revision 1)

Per `document/workflow/automated-testing.md`; vitest + Testing Library, typed fixtures (no live API until the contract is approved).

| ID | Level | Covers |
|---|---|---|
| UT-MS-01 | unit `form.ts` | C-01 split cost by weight / by pcs; last child absorbs rounding; Σ = source cost |
| UT-MS-02 | unit `form.ts` | C-02 weighted average (example 65,000 ÷ 5.00 = 13,000 per ct); all-per-pcs → per pcs; mixed → per ct |
| UT-MS-03 | unit `form.ts` | C-03 suggested source = highest cost per piece, tie → first |
| UT-MS-04 | unit `form.ts` | S-01…S-06 incl. split balance (pcs and weight), ≥ 2 children / sources, totals mismatch |
| UT-MS-05 | unit `api.ts` | request mapping, error code → message mapping |
| IT-MS-01 | component page | header, Doc Date / Ref., From Stock is the only source button, access states (no VIEW, no ADD) |
| IT-MS-02 | component picker | `MemoStockModal` `merge-split` variant: own Stock ID rows, available pcs/weight, location, lot, cost, sale price; excludes picked; empty / error + retry |
| IT-MS-03 | component mode dialog | only Split and Merge; Merge disabled with < 2 stocks; later picks reuse mode |
| IT-MS-04 | component result table | Split group "+ Split", balance chip, remove; Merge single row locked qty; totals row |
| IT-MS-05 | component flow | approval OFF Save → Approved; ON → Draft / Send → Pending; 409 STOCK_CHANGED keeps edits |
| IT-MS-06 | component | navigation link, Approve Center `merge-split` panel available |
| REG | existing | Load to Stock, Stock Adjustment and `MemoStockModal` tests stay green |
