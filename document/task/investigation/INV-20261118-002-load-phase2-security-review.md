# INV-20261118-002 — Load to Stock phase 2 focused security review (security-auditor)

## Tracking

- Ticket revision: 1
- Status: clear (no actionable finding; nothing to select or remediate)
- Owner: none (advisory notes only, backend for awareness)
- Priority: none
- Auditor / mode / run ID: security-auditor / focused technical review (read-only, logic / authorization / concurrency) / no run tree
- Date and audit scope: 2026-11-18; load-to-stock phase 2 only (ADR-0052 Amendment 2 D16–D23, SA-LS-P2-*, SA-LS-18).
  Reviewed: `backend-api-inventory/src/internal/master-routes.ts`, `src/modules/stock/holds.ts`, `picker.ts` (filters),
  load-to-stock `service.ts` / `read.ts` diffs, inventory migration `20261118100000_stock_holds_phase2`;
  `backend-api-master/src/trade-document/inventory-hold-saga.ts`, `own-stock-lines.ts`, `from-stock.service.ts`,
  `customer-stock-document.ts`, `memo-out-return.service.ts`, `source-lock.ts`, `document-engine.ts` (afterWrite),
  `memo-schemas.ts`, quotation schema/service diffs, `master/router.ts` (fromStock), `inventory-client/*`, master migration
  `20261118100000_own_stock_lines`. Frontend files and tests were not reviewed (out of the requested focus).
- Source commit, dirty paths, and relevant content hashes: HEAD `fa080af` on `feat/18-11-26-load-phase2` plus the
  uncommitted working tree vs origin/dev (28 modified backend files + untracked phase-2 files). SHA-256 prefixes:
  `inventory-hold-saga.ts` fd91261bdb48f489, `holds.ts` df8be6da3074be2d, `customer-stock-document.ts` 80b81876c3dfade8,
  `memo-out-return.service.ts` 40ba79548ad59917, `master-routes.ts` eacfa916c7296e89
- Related ticket / root-cause fingerprint: INV-20261117-003 (phase-1 review). INV-20261118-001 is sec-auditor's parallel
  record and is not touched here.
- Category: none (clear); advisory notes below are hardening observations
- Verdict: not-applicable (no vulnerability found)

## Evidence and impact

Checked and found consistent with the approved design (no exploitable path found):

- Authorization: `fromStock.list` = `permittedAny(["quotation","reserve","memo-out"], "VIEW")` (router.ts); own-stock
  saves go through the existing per-procedure `ADD`/`EDIT`/`DELETE`/approve grants of each document; fields exposed
  (`stockPrice`, `salePrice`, vendor) match api-contract line 230; cost (`unit_cost_base`) is not exposed.
- `ownStockId` IDOR: any ACTIVE stock may be picked by design (no per-stock ACL); copied fields come from inventory
  (`{...line, ...copy}`) or the stored line (kept rule), never from the client; inventory re-checks ACTIVE/on-hand under
  `FOR UPDATE`. MOR own stock is derived server-side from `memo_out_line.own_stock_id`; customer/currency/outstanding
  are validated under source locks.
- Internal API: bearer compared as SHA-256 digests in constant time, distinct-token check, guard before body parsing,
  64 KiB / 4-in-flight limits, strict Zod, path type allow-list; `X-Actor-User-Id` is audit only.
- Saga: tx0 conditional `IDLE`+`version` marks SYNCING (no double acquire); acquire → tx1 (`afterWrite` re-checks op
  stage/revision `FOR UPDATE` and `covered()`) → release after commit; compensation only `r+1 = H_old` of this op and is
  claim-guarded on `stage='ACQUIRE' AND revision`; unknown acquire stays PREPARED and is abandoned by re-drive;
  STALE / EXCEEDS_MEMO_OUT → STUCK. Fast path falls back on `SagaRequired` (errors.map passes it through).
- Two documents racing for one stock: inventory locks stock rows `FOR UPDATE` in id order and checks per-dimension
  on-hand / bucket; `stock_hold_document` upsert serializes per document (higher revision / same-hash replay / STALE).
- Approval ON/OFF: holds only for APPROVED non-deleted lines; prediction drift caught by `covered()` (BUSY) or turned
  into a release; restore / approve / delete route through the saga.
- Load "used": current-state rule (on-hand ≠ pcs) with `holders` (type + doc no, ≤ 5) as specified in SA-LS-P2-08;
  no customer/price data leaks. SA-LS-18: `applyHolds` refuses stock of a SYNCING load.
- Migrations: inventory re-key refuses a non-empty `stock_hold`, backfills `ref_doc_*` before NOT NULL; master migration is
  additive with CHECKs and per-document unique own-stock indexes.
- Sweep / re-drive: claims with a 15 s lease (`FOR UPDATE SKIP LOCKED`), single-flight timer, bounded batch/purge;
  master starts without inventory (lazy client, failures caught, ops go STUCK after 10 attempts).

Advisory notes (not vulnerabilities, no ticket action required):

- A1: `drive()` (inventory-hold-saga.ts:396-399) marks every `InventoryRefusal` STUCK, including a transient
  `STOCK_HOLD_BUSY` (holds.ts:69 applies the SYNCING-load check to decreases too). With the current load guards a held
  stock's load cannot enter SYNCING, so this is not reachable today; if a future module changes that, consider retrying
  BUSY instead of STUCK.
- A2: the go-live `approveWithin` path calls `afterWrite` without saga context, so a pending own-stock document throws
  `SagaRequired` there (fails closed, nothing held). Operational, not security.

- Missing validation fact / capability: none; static review only, no tests or services were run.

## Proposed work

- None. A clean scoped review creates no remediation.

## User selection and approval

- Approved ticket revision: n/a (clear)

## Implementation and resolution

- Final status / date: clear / 2026-11-18
