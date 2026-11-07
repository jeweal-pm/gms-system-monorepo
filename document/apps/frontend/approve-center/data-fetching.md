# Frontend data flow: approve-center

- UI revision: 1 (approved 2026-11-07)
- Related contracts: existing per-document tRPC procedures in `backend-api-master/src/master/router.ts` (quotation, reserve, purchaseOrder, purchase, memoReceive, memoReturn, memoOut, memoOutReturn); list engine `src/trade-document/document-engine.ts` `list()`; soft delete [ADR-0045](../../../adr/0045-transaction-document-soft-delete.md).
- Backend requirement: **phase 1 unchanged-approved** (existing procedures only); **phase 2 requires-sa** ([handoff](../../../coordination/handoffs/approve-center-sa.md), SA-AP-01…05).

## What the existing list returns (verified)

`<doc>.list` input: `q` (≤ 100, matches doc no., party name, ref), `partyId`, `from`, `to`, `status`, `cursor`, `limit` (1–50, default 50), `deleted` (default `false`). Output items: `id, docNo, status, docDate, dueDate, customerName|vendorName, currency, grandTotal, updatedAt, deletedAt`, plus `nextCursor` and `total`. Order: doc date desc, created desc, id desc. Indexed by `(status, doc_date desc, created_at desc, id desc)` on every document table.

**Missing for the design**: `version` (needed by `approve`), line count, stone names, Σ pcs / Σ weight, submitter name and role, submitted time, stone / Stock ID search, oldest-first order, and one call for all counts. The list returns user ids nowhere and the auth service has no user lookup for master (same gap as the soft-delete "Deleted by another user" banner).

## Operations

| UI action / TODO ID | Phase 1 operation (existing) | Input / output | Query key / cache | Loading / error / empty | Phase 2 (requires-sa) | Backend owner |
|---|---|---|---|---|---|---|
| Panel counts + sidebar total (FE-AP-003) | `<doc>.list` per available menu with `{ status: "PENDING_APPROVAL", limit: 1 }` → `total` (7 calls; Quotation "off" and the not-available menus make none) | → `total` | tRPC key per doc; `staleTime` 60 s; refetch on window focus and after any approve; no interval polling | no badge while loading or on error | SA-AP-01 `approval.summary` → `{ [menu]: count }` in one bounded query | master |
| Pending rows (FE-AP-004) | `<doc>.list` `{ status: "PENDING_APPROVAL", q, limit: 50, cursor }` via `useInfiniteQuery` | rows (fields above) | key includes menu + `q`; `staleTime` 30 s; refetch on focus | skeleton / error + Retry / empty | SA-AP-02 enriched rows + `sort` (oldest first) | master |
| Search (FE-AP-004) | same, `q` debounced 300 ms, trimmed, ≤ 100 | — | new key per `q` | — | SA-AP-03 adds stone name and Stock ID matching | master |
| Approve one (FE-AP-005) | `<doc>.get({ id })` → `version`, then `<doc>.approve({ id, expectedVersion })` | → approved | invalidate: this menu's list, counts, and `master.<doc>.get/list` | button spinner; row error | SA-AP-02 returns `version` in the row, so the `get` is skipped | master |
| Approve selected (FE-AP-006) | the same pair per document, **sequential**, stop on Cancel | per-row result | invalidate once at the end | progress line; partial result | same | master |
| Reject… / Revise… (FE-AP-007) | none — buttons disabled | — | — | — | SA-AP-04 after owner answers Q-AP-01/02 | master |
| Inventory menus (FE-AP-008) | none — "Not available yet" | — | — | — | SA-AP-05 when Load to Stock / Merge-Split / Transfer Location are designed | master (TBD) |
| Menu visibility (FE-AP-002) | existing `mine` permissions (`useMenuAccess` source) | `<leaf>:APPROVE` | existing | item hidden until known | none | auth (existing) |

Phase 1 cells without data render "—": Qty, line count, stone names, Submitted user/role. Submitted time shows `updatedAt` labelled in the cell tooltip as "Last saved" until SA-AP-02 supplies the submitted time. This is a **documented limitation**, not proof of the final contract.

## Bounds and budget (4 GB RAM / 2 vCPU)

- Each request is bounded: counts `limit: 1` (count uses the status index), rows ≤ 50 per page.
- No interval polling. Counts refetch on focus (≥ 60 s stale) and after mutations; at most 7 small count queries per user per minute in phase 1, 1 in phase 2.
- No per-row `get` fan-out for display: `get` runs only for the row being approved.
- Bulk approve runs one document at a time; the selection is limited to the loaded rows (≤ 50 per page, at most what the user loaded).
- Phase 1 ordering: the API returns newest first, so the default "oldest first" sort applies to the loaded rows only; with more than 50 pending the first page holds the newest 50. SA-AP-02 adds server ordering.

## Duplicate requests and races

- Approve buttons disable while their request runs; a second click does nothing.
- `*_CHANGED` (stale version) and `*_STATUS_INVALID` (already approved elsewhere) refetch the list; the row disappears if no longer pending ([error-handling.md](error-handling.md)).
- Deleted while listed: `*_DELETED` / `*_NOT_FOUND` → row removed after refetch.

## Mocks

`fixtures.ts` reproduces source 02 for tests only. The running page always uses the real API; menus without an API show the "Not available yet" state rather than mock rows.
