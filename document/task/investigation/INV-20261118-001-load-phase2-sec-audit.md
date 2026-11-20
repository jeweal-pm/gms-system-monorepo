# INV-20261118-001 — Load to stock phase 2 focused security review (sec-auditor): clear

## Tracking

- Ticket revision: 1
- Status: clear (no actionable finding; nothing to select or remediate)
- Owner: backend (reference only; no work assigned)
- Priority: none
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, read-only, static) / no full-audit run
- Date and audit scope: 2026-11-18; ADR-0052 Amendment 2 D16–D23 load-to-stock phase 2 diff only
- Source commit, dirty paths, and relevant content hashes: HEAD `fa080af` on `feat/18-11-26-load-phase2` plus uncommitted
  working tree. Blob hashes (git hash-object, 12 chars): inventory `src/internal/master-routes.ts` 7a52ef2d8a21,
  `src/modules/stock/holds.ts` d0975dcf8012, `src/modules/stock/picker.ts` 1591511e981c; master
  `src/inventory-client/inventory-client.ts` 964bb51e8676, `src/trade-document/inventory-hold-saga.ts` dbf4d76bfff6,
  `own-stock-lines.ts` 4efebebd9864, `from-stock.service.ts` 061a41fe5bea, `customer-stock-document.ts` 237df75faab0,
  `memo-out-return.service.ts` 0bdc04ae6297; `docker-compose.gms.dev.yml` 62f0fdc596be.
- Related ticket / root-cause fingerprint: parallel security-auditor record INV-20261118-002 (not reviewed here)
- Category: vulnerability (review result)
- Verdict: no confirmed or needs_validation candidate; checked surfaces below are clear

## Evidence and impact

Checked boundaries and result:

- Inventory `/internal/v1/master/*` (`master-routes.ts`): bearer compared as SHA-256 digests with `timingSafeEqual`;
  missing/malformed token file never matches; the inventory→master token is read as `otherTokenDigest` and an equal value
  disables the routes (logged). Guard runs before body parsing; in-flight cap 4 → 503 + Retry-After; `bodyLimit` 64 KiB;
  strict zod bodies, UUID/whitelisted path params, actor header regex and audit-only use. Not routed by nginx
  (`location ^~ /internal/ { return 404; }`, only `/api/inventory/` proxied); service publishes no host port.
- Master inbound guard (`inventory-token.guard.ts`, unchanged) accepts only `INVENTORY_MASTER_SERVICE_TOKEN`; the new
  master→inventory token is a separate secret, so each token works in one direction only (equal-value misconfiguration is
  refused on the inventory side).
- Master `inventory-client.ts`: base URL rejects credentials/query/fragment; per-call timer (2 s / 5 s) destroys the
  request; response capped at 1 MiB; one retry only for INVENTORY_BUSY; 401/403/5xx → generic `INVENTORY_UNAVAILABLE`;
  logs carry codes/reasons only, never the token or body.
- `fromStock.list`: `permittedAny(["quotation","reserve","memo-out"], "VIEW")`; own-stock rows expose only contract
  fields (stockPrice/salePrice/vendor/load ref, api-contract L215–L260); `unit_cost_base`/`cost_amount_base` never leave
  inventory (picker SELECT omits them). Inventory failure degrades to Memo Stock rows.
- Line validation: quotation and memo-out schemas require exactly one of `memoStockId`/`ownStockId` and reject duplicates;
  `completeOwnStockLines` refuses unknown or non-ACTIVE stock (`invalid_reference`) and quantities above available +
  this document's current hold; the kept rule only lowers or keeps stored quantities.
- Hold saga: inventory `applyHolds` locks the per-document row, applies only a higher revision (same revision requires the
  same canonical hash, else STALE), locks stocks FOR UPDATE, refuses SYNCING loads, over-hold (per dimension against
  on-hand), over-return (memo_out bucket) and under-release. Holds are keyed by (type, document id) with server-generated
  ids (uuidV7), so a caller cannot target another document's set. Master marks SYNCING with version + IDLE guards, re-checks
  the op under FOR UPDATE in tx1, requires `covered(final, mid)`, compensates with `r+1 = H_old`, and the fast path throws
  `SagaRequired` for any document that holds/held stock (approve/restore/delete/approveWithin fail closed). Memo Out Return
  lines are validated against the customer, currency, APPROVED/live Memo Out and outstanding quantity; SYNCING source Memo
  Outs are refused. Sweep: single flight, ≤ 20 ops, SKIP LOCKED lease, bounded backoff, STUCK after 10; operator script
  validates type and UUID.
- Compose/secrets: `master_inventory_service_token` is a file secret from a host path outside the repo
  (`${...:?}` required), mounted only into api-master and backend-api-inventory; setup script creates it as a distinct token.
- Frontend: new fields and error `params` render as React text (`stock-row-errors.ts`); no HTML/URL sinks added in the diff.

- Missing validation fact / capability: static review only; no live requests, no concurrency test runs. Production
  nginx/compose profiles were not in the diff and were not re-reviewed.
- Raw report/run links: none (focused review, no run tree).

## Proposed work

None. No ticket to select. Residual note (not a finding): uppercase-UUID `ownStockId` variants are not case-folded in
master duplicate checks, but inventory lowercases and rejects duplicates and the saga re-reads stored UUIDs, so the
effect is a refused save, not an over-hold.

## User selection and approval

- Approved ticket revision: not applicable (clear)

## Implementation and resolution

- Corrective pass limit: not applicable; passes allocated: 0
- Final status / date: clear / 2026-11-18
