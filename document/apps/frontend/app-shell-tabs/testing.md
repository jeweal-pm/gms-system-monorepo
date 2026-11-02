# Testing: app-shell-tabs (revision 1)

Results 2026-11-02: UT-TAB-01…05 pass (`frontend/test/home/tabs.test.ts`, 17 tests); TC-TAB-01 passed live on :8080 (headless Edge).

| ID | Level | What |
|---|---|---|
| UT-TAB-01 | unit | tab store: open / switch by path (T-01), 15 limit refuses a 16th (T-04), close picks right then left neighbour, last close opens Home (T-06), Close all leaves Home, titles (T-03) |
| UT-TAB-02 | unit | persistence: tab list saved per user and restored (T-07); bad / foreign stored data ignored; another user's list not shown |
| UT-TAB-03 | unit | unsaved tracking: a page reporting dirty marks its tab; close asks; Close all counts dirty tabs (T-05) |
| UT-TAB-04 | unit | tab bar render: states (default / active / unsaved dot), roles and names, count box and Close all disabled states, arrows only on overflow |
| UT-TAB-05 | unit | every App Shell page still renders its breadcrumbs and title through the shared layout (no page renders its own App Shell any more); detail pages read their id from route props, not the active URL |
| TC-TAB-01 | browser (:8080) | open Quotation, type a value, open Memo Out from the sidebar, type, switch back: both values still there; open the same menu again → same tab; open 15 tabs → 16th refused; close a dirty tab → confirm; Close all → Home only; refresh → tabs reopen |
