# TODO: memo-receive

- feature-id: `memo-receive`
- revision: 2
- status: **implemented** 2026-10-28 (UI revision 2); browser check by the owner pending
- source: owner design 2026-10-28 ([page](../../apps/frontend/memo-receive/source/01-memo-receive-design.png), [row panel info](../../apps/frontend/memo-receive/source/02-row-panel-info.png)) + owner text
- ui-spec: [ui-spec.md](../../apps/frontend/memo-receive/ui-spec.md); answers: [open-questions.md](../../apps/frontend/memo-receive/open-questions.md)
- decision: [ADR-0033](../../adr/0033-memo-receive-frontend-mock.md) (Accepted)
- backend-bundles: none. Existing master APIs only (vendor, currency, stone master, document setup); Memo Receive documents are mock (owner 2026-10-28)
- dependencies: none new
- approved-revision: memo-receive UI revision 1 (answers Q-MR-01…07)
- approved-by: project owner
- approved-at: 2026-10-28T10:30+07:00
- approval-evidence: owner 2026-10-28, answers to Q-MR-01…07 and "ตอนนี้เเค่ทำ UI mock data พอยังไม่ต้องต่อ api จริง หรือ คิดว่าสามารถต่อกับ api จริงตัวอื่นก่อนได้ก็ต่อเลย เช่น stonemaster stone vendor document master currency เเค่ยังไม่ต้องทำของ memo receive"
- review-bundle: ADR-0033, ui-spec, open-questions, this TODO
- updated-at: 2026-10-28T10:30+07:00

## Frontend

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MR-001 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Routes `/memo/memo-receive` + `[id]`, `REAL_PAGE_HREFS["memo-receive"]`, breadcrumb, `memo-receive` permission gate | `frontend/src/app/memo/memo-receive/**`, `frontend/src/features/home/navigation.ts` | approval | Sidebar opens the page; denied without VIEW | navigation test |
| [x] | FE-MR-002 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | `api.ts`: real reads (vendor.list/get, currency.options, stoneMaster.options + stoneCode.list/get, documentSetup.get `memo-receive`); mock locations; mock documents in memory + `localStorage` `gms.memo-receive.v1` (bounded, validated); number from Document Setup (plain without a row); Stock ID plain running 1, 2, 3; status Pending Approval | `frontend/src/features/memo-receive/**` | FE-MR-001 | Save/get/list/delete survive refresh; Stock IDs assigned on save, never reused | UT-MR-01…04 |
| [x] | FE-MR-003 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Schema (zod) + totals with no discount, reusing the Quotation calculator | same | FE-MR-002 | Matches ui-spec P-08…P-11, S | UT-MR-05 |
| [x] | FE-MR-004 | done 2026-10-28; frontend 432 tests, tsc, eslint pass; page served 200 on :8080; browser not run | frontend | Page: header, info form, item table, row panel (Stock ID read-only "Auto", Location select, Memo Price, no line discount), photo box, document note (250), Summary Value without discount, Daybook. Quotation components read a `DocumentKind` context whose default keeps Quotation unchanged (ADR-0033 D5) | same + `frontend/src/features/quotation/components/**` and `frontend/src/features/quotation/document-kind.tsx` (context only) | FE-MR-003 | Matches the design and ui-spec; Quotation unchanged | UT-MR-06, existing quotation tests |
| [x] | FE-MR-005 | done 2026-10-28: frontend 432 tests, tsc, eslint pass; sec-auditor + security-auditor clear (advisory only: blob URLs not revoked, mock documents unencrypted in localStorage) | frontend + parent | Tests, typecheck, lint; dual security review (sec-auditor + security-auditor) | — | all | All suites pass | — |

## Revision 2 (owner 2026-10-28)

Direct owner instruction (verbatim in [ui-spec.md](../../apps/frontend/memo-receive/ui-spec.md)): Quantity & Price, line Discount (%) / Discount Amt and the Summary Value discount as Quotation; no Stone Code, the Stock ID leads instead.

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|
| [x] | FE-MR-006 | done 2026-10-28; frontend 433 tests, tsc, eslint pass; sec-auditor + security-auditor clear (advisory: discount limits must be re-checked by the future API; an amount discount has no upper bound, so totals can go negative) | frontend | `DocumentKind`: drop pricing/discount switches, add `stoneCode`; Memo Receive uses Quotation pricing and discounts; schema allows the document discount and checks line % ≤ 100; no Stone Code field/column/code list; table first column STOCK ID / LOT; panel title "Stock ID n" | `frontend/src/features/memo-receive/**`, `frontend/src/features/quotation/document-kind.tsx`, `frontend/src/features/quotation/components/items/**` | rev 1 | Matches rev 2; Quotation unchanged | UT-MR-05, UT-MR-06 |

## Decisions

Approved 2026-10-28 with the owner's answers to Q-MR-01…07 ([open-questions.md](../../apps/frontend/memo-receive/open-questions.md)); the owner noted the answers may change later.
