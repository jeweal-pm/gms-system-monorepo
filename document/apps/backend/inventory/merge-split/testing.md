# Testing: inventory / merge-split (SA revision 1, pending-review)

Follows [automated-testing](../../../../workflow/automated-testing.md). Unit tests use Vitest; integration tests run against the real Postgres of the existing inventory suites (copy the stock-adjustment setup).

| ID | Level | Target | Checks |
|---|---|---|---|
| UT-MS-B01 | unit | `schemas.ts` | mode rules, ≥ 2 results per SPLIT source, MERGE 2–200 sources and 1 result, Σ equality, ≤ 200, distinct stockUuid, decimals as strings |
| UT-MS-B02 | unit | cost math | split by weight (PER_CT) / pcs (PER_PCS), residue on the last result, Σ result = take cost; merge weighted average, mixed units → PER_CT, basis 0 → unit 0 (UI example 65,000 ÷ 5 ct = 13,000) |
| UT-MS-B03 | unit | `card-kinds.ts` | six kinds registered (UT-SC-02 coverage passes), `merge-split` document type visible |
| UT-MS-B04 | unit | `read.ts` | list, get, picker, pending use a fixed number of statements for 1 and 50/200 rows |
| IT-MS-B01 | integration | split OFF | source on hand 0, `consumed` = take, `pcs` unchanged, balance check holds; N new ACTIVE stocks with master Stock IDs, inherited ref/vendor/currency, own `lot_key`; SPLIT_OUT/IN rows, Σ cost delta 0 |
| IT-MS-B02 | integration | merge OFF | one new stock = Σ pcs/weight/cost, oldest source's ref; MERGE_OUT per source; mixed currency → 422 |
| IT-MS-B03 | integration | availability | reserved / memo-out part never taken; on hand changed after pick → 409 STOCK_CHANGED, nothing written; SYNCING load → 409 BUSY |
| IT-MS-B04 | integration | approval ON | DRAFT no effect and no Stock IDs; submit refuses a source on another PENDING doc; approve applies; revise once; reject final |
| IT-MS-B05 | integration | reverse | delete effective → sources restored, results REVERSED, *_REVERSAL rows; after a Reserve / Sale / Adjustment / later MS on a result → 409 IN_USE; edit auto-approved → new Stock IDs |
| IT-MS-B06 | integration | picker | own only, on hand > 0, location/q filters, exclude, Pending exclusion with `excludeDocId`, keyset paging; source with on hand 0 disappears |
| IT-MS-B07 | integration | Stock Card / Value | cross-card conversion shows OUT on source card, IN on result card with MS doc link; same-card conversion nets out; Stock Value total unchanged (± 0) |
| IT-MS-B08 | integration | Load interaction | a load whose stock was converted is "used" (LOAD_TO_STOCK_IN_USE) |
| IT-MS-B09 | integration | authorization | each route refuses without its grant; CSRF required; photo download only for linked files |
| IT-MS-B10 | integration | concurrency | two approvals sharing a source in parallel → one wins, the other 409 (id-ordered locks, no deadlock) |
| IT-MS-B11 | integration (master) | `stock-ids/issue` | count IDs from the shared counter; same key replays; other count → 409; service token required; numbering key `merge-split` returns `MS…` |

## Query budgets

| Operation | Budget |
|---|---|
| `GET /merge-split/stock` | 1 statement per page ≤ 50 |
| `GET /merge-split`, `/approval/pending` | 1 statement per page |
| `GET /merge-split/{id}` | 2 statements for ≤ 200 + 200 lines |
| Apply / reverse | fixed (≈ 10) for any line count; no per-line query; no HTTP inside the transaction |

## Implementation result (2026-11-27)

Branch `feat/25-11-26-merge-and-split`, uncommitted. Owner direct approval 2026-11-27 ("frontend backend เริ่มทำ Merge/Split เลย ไม่ต้องรัน sec กับ audit"): UI rev 1, SA rev 1, ADR-0060 (merge-split) with the Q-MS / SQ-MS defaults. Security reviews were skipped at the owner's instruction.

Disposable PostgreSQL 18.6 (`it-pg`, tmpfs, 127.0.0.1:55432): auth migrations → master migrations (`?schema=partner`) → `provision-inventory-authz-reader.sql` → `provision-inventory-roles.sql` → inventory migrations as `gms_inventory_migrator`; the service in the ITs runs as `gms_inventory_app`; master is the real `InventoryInternalController` bound to a port.

| Check | Result |
|---|---|
| `prisma migrate deploy` of `20261127100000_merge_split` (inventory) and `20261127100000_inventory_stock_id_issue` (master) on a fresh DB | pass |
| Both rollback scripts executed inside `BEGIN … ROLLBACK` on that DB | pass |
| inventory `vitest run test/merge-split` | 2 files, **24 passed** (UT-MS-B01…B03: 11; IT-MS-B01…B11 + NP-MS: 13) |
| inventory `vitest run` (full) | 25 files; 272 passed, 2 failed, 6 skipped. The 2 failures are the pre-existing ones recorded in stock-transfer-location testing: `zz-adhoc-perf.test.ts` (hard-coded `f1_perf` DB) and IT-SV-S1 "probe is not run" (passes when its file runs alone: 25/25) |
| `test/stock-card/domain.test.ts` UT-SC-01 expected kind list updated with the six kinds; UT-SC-02 coverage passes | pass |
| inventory `tsc --noEmit`, ESLint `src` + `test` | clean |
| master `vitest run test/inventory-internal test/document-setup` | 9 files, 74 passed (incl. UT-MS-M01) |
| master `tsc --noEmit`, ESLint `src/inventory-internal` + `test/inventory-internal` | clean |

### N+1 review (query counts measured with the harness query hook, setup / auth excluded)

| Endpoint | Data access | 1 vs many rows | Evidence |
|---|---|---|---|
| `GET /merge-split/stock` | 1 statement (photo count, load sync, Pending exclusion as scalar / `NOT EXISTS` subqueries) | 1 (limit 1) = 1 (limit 50) | IT-MS-B06 |
| `GET /merge-split` | 1 keyset statement (counts stored on the header) | 1 | NP-MS |
| `GET /merge-split/{id}` | 2 (header + one statement returning sources / results / photo ids as JSON) | 2 for 2 results = 2 for 10 results | NP-MS |
| `GET /approval/pending?type=merge-split`, `/approval/summary` | 1 each | 1 | NP-MS |
| `GET /merge-split/stock/{uuid}/photos`, photo download | 1 | — | IT-MS-B09 |
| `POST /merge-split` (apply) | 13 statements in total (prepare 3 reads, setting, numbering lock + max, header, 3 line inserts, `applyConversion` 8 minus empty photo insert); master: resolve, numbering, stock-id issue | 13 for 2 results = 13 for 10 = 13 for 200 | NP-MS |
| delete (reverse) | 10 statements | equal for 2 and 10 results | NP-MS |
| submit / approve | stored lines 2 + facts 1 + guarded update / apply (fixed) | fixed | IT-MS-B04 |

200-result apply (one source → 200 results): 13 statements, **479 ms end to end** on the dev laptop including the three master calls (target < 500 ms).

### Contract notes for frontend

- Internal only: Stock IDs come from the existing `PUT /internal/v1/inventory/stock-id-issues/merge-split/{documentId}` `{revision: applySeq, count}` (table `partner.stock_id_issue`), not a new `POST /stock-ids/issue` + `partner.inventory_stock_id_issue`. Same counter, same replay per (type, id, applySeq). A replay with a larger count appends ids instead of returning 409 `STOCK_ID_ISSUE_CONFLICT`; a lower applySeq → 409 `VERSION_CONFLICT`. No public contract change.
- `MERGE_SPLIT_STOCK_CHANGED.details.sources[]` also carries `key` (the client source key) next to `sourceId`.
- Approval OFF at submit and a second revise answer 409 `MERGE_SPLIT_STATUS` with `details.reason` `"APPROVAL_OFF"` / `"REVISE_LIMIT"` (no new codes).
- `MERGE_SPLIT_SOURCE_UNAVAILABLE` (422) is used for unknown or REVERSED stock at every step; `MERGE_SPLIT_STOCK_CHANGED` for on hand ≠ snapshot.
- `NUMBERING_NOT_CONFIGURED` (422) on Save and next-number when Document Setup `merge-split` has no row in effect.
- Delete is allowed for DRAFT / REVISION_REQUESTED / REJECTED and any APPROVED document (reverse first); PENDING → 409 `MERGE_SPLIT_STATUS`.
- Photo upload answers `201 { fileId }`; download also serves the uploader's own not-yet-linked upload (preview before Save).
- The picker returns stocks with on hand pcs ≥ 1 (a source needs `availPcs ≥ 1`).
