# UI specification: currency

- Feature ID / revision: `currency` / 1
- Status: **approved and implemented**. Owner 2026-10-26: "uxui ทำ spec Currency ให้เอาไปใช้ใน company profile และทุก currency และ frontend backend ทำต่อเลย". The same instruction asked for the spec and its implementation, so revision 1 counts as approved with the proposed defaults Q-CUR-01…08.
- Source: one owner-supplied GMS design, [source/01-currency-add.png](source/01-currency-add.png), 3840×2160 px, SHA-256 prefix `a33b742040b01565`. It shows the Add (draft) state; view, edit and error states follow the Stone Master / Partner Master pages.
- Review bundle:
  - this file
  - [data-fetching.md](data-fetching.md), [error-handling.md](error-handling.md), [testing.md](testing.md), [open-questions.md](open-questions.md)
  - SA: [decisions.md](../../backend/master/currency/decisions.md)
  - central TODO: [`document/task/todo/currency.md`](../../../task/todo/currency.md)
- Reused without change: design tokens and components (`Card`, `TextField`, `Switch`, `PartnerPageHeader`, `PartnerDrawer`, `ConfirmDialog`, toast), the page frame and drawer rule ([drawer-layout.ts](../../../../frontend/src/lib/drawer-layout.ts)), and the Stone Master conventions. No new package.

## Purpose

Currency becomes a master list kept in Setup › Master Code › Currency. It replaces the fixed ISO list every currency select used until now. Each currency has an exchange rate against the **base currency**, which is the Company Profile currency (Q-CUR-01):

| Where | Before | After |
|---|---|---|
| Company Profile › Company Currency | full ISO list (~300) | active currencies from this page. The chosen one is the base currency. |
| Vendor / Customer › Currency | full ISO list | active currencies; a saved inactive one still shows, marked "(inactive)" |
| Quotation › Currency + Exchange Rate | mock list with fixed rates | active currencies; Exchange Rate fills from the currency's **Selling Rate** (selling to a customer). The base currency leaves the rate empty. |

## Page structure (source 01)

Route `/setup/currency`. Breadcrumb: Home › Setup › Currency. The left context panel shows the group "Currency" with one child, "Currency", in the same pattern as the Stone Master context panel.

```
[ Header: "Add Currency" | record "USD"   Currency List 3   print · excel · duplicate · refresh ]
[                         [+ Create Currency] [Cancel] [Save] [Edit] [Delete]                    ]
[ Card "Currency"                                   Active ◉ | Drawer "Currencies 3"   ✕       ]
[   Code Name*   (e.g. USD)                                  |  Search code or name...         ]
[   Name*        (e.g. US Dollar)                            |  + New currency  Not saved yet [Draft] ]
[   Description* (textarea, 0/250)                           |  ● THB · Thai Baht              ]
[   ┌ Exchange Rate ──────────────────────┐                  |    Base currency                ]
[   │ Selling Rate*      Buying Rate*      │                  |  ● USD · US Dollar              ]
[   │ 1 = [  0.0000] THB 1 = [  0.0000] THB│                  |    Sell 33.2500 · Buy 32.9000 THB ]
[   │ Used when you sell… Used when you buy…│                 |  ○ INR · Indian Rupee [Inactive] ]
[   └──────────────────────────────────────┘                  |    Sell 0.4000 · Buy 0.3850 THB ]
```

- Fields sit in one column, at most 404 px wide (as on Stone Master). The Exchange Rate panel is a sunken box (`bg-gms-surface-sunken`, radius lg, padding 20) with two rate fields side by side; they stack below 400 px.
- The drawer is 320 px wide. On a PC it pushes the content and starts open; on an iPad it overlays and starts closed (drawer-layout rule).

## Components and states

| ID | Component | Behavior |
|---|---|---|
| C-01 | Header (`PartnerPageHeader`, entity Currency / Currencies, permission key `currency`) | The title is "Add Currency" on a draft, otherwise the record code. "Currency List N" is the total. Print, Duplicate, Refresh, Create, Cancel, Save, Edit and Delete follow the Stone Master rules. The Excel icon stays disabled as on other masters. |
| C-02 | Card "Currency" with an Active switch in the header | New currencies default to Active. The **base currency's switch is disabled**, with the helper "The company currency is always active" (Q-CUR-03). |
| C-03 | Code Name* | Exactly 3 letters A–Z, uppercased as typed, e.g. USD (Q-CUR-02). **Read-only after the first save**, because other records store the code (Q-CUR-04). Helper in edit mode: "Code can't be changed after saving". |
| C-04 | Name* | 1–100 characters, e.g. "US Dollar". |
| C-05 | Description* | Textarea, 1–250 characters, counter "n/250". Placeholder: "Notes for your team, e.g. which vendors use this currency". |
| C-06 | Exchange Rate panel: **Selling Rate\*** and **Buying Rate\*** | Each input reads "1 = [rate] {BASE}": prefix "1 =", right-aligned value, suffix = base code. Digits and one dot only, at most 4 decimals, greater than 0, at most 99,999,999,999,999.9999. Formatted to 4 decimals on blur. Helpers: "Used when you sell to customers in this currency." / "Used when you buy from vendors in this currency." |
| C-06b | Exchange Rate panel for the base currency | No inputs. Text: "Base currency — other currencies' rates are set against {BASE}. Change it in Company Profile." |
| C-06c | No company currency yet | The suffix shows "base" and a note reads "Set the company currency in Company Profile". Rates are still required. |
| C-07 | Drawer "Currencies N" | Search by code or name. A "New currency · Not saved yet · Draft" row appears while creating. Each row shows a status dot, **"{CODE} · {Name}"** in bold, and a second line: "Base currency", "Sell {s} · Buy {b} {BASE}", or "Rates not set" (rows created by the migration). Inactive rows carry the "Inactive" badge. Sorted by code. |
| C-08 | Delete confirm | A currency in use (Company Profile, a vendor or a customer) can't be deleted; the message says to turn off Active instead. |

## Rules

1. The base currency is the Company Profile currency. Its rates are not stored and always count as 1.
2. Rates are stored against the base currency. Changing the company currency does not convert any rate: the old base shows "Rates not set" until someone edits it (Q-CUR-05).
3. Inactive currencies drop out of new choices everywhere. Records that already use one keep it, and it shows as "{CODE} — {Name} (inactive)".
4. Existing data: the migration creates one active currency for every code already used by Company Profile, vendors and customers, plus THB and USD. These rows get "Rates not set" (Q-CUR-06).
5. Quotation uses the Selling Rate. The Buying Rate is for purchase documents later (Q-CUR-07).

## Permission

A new catalog leaf `currency` in Setup › Master Code with the standard nine actions (Q-CUR-08). The Master Code tile and the context panel need `currency:VIEW`. The Quotation page reads the currency options with `quotation:VIEW`.

Data and API: [data-fetching.md](data-fetching.md). Errors: [error-handling.md](error-handling.md). Tests: [testing.md](testing.md).
