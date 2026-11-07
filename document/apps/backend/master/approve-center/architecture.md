# Architecture: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

## Service boundary

- Owning service: `backend-api-master` (schema `partner`). All seven documents live there, so the Approve Center API is a new **read-only** `approval` router in the same process. No new service, container, worker, cache, queue, push channel or package.
- Auth (`backend-api-auth`): one additive column on the `auth.current_authorization` view (D5), implemented by the auth owner in an auth migration. No auth endpoint, permission catalog or token change.
- Transport unchanged: tRPC over HTTP via the same-origin proxy and nginx ([ADR-0025](../../../../adr/0025-gms-domain-routing-and-trpc.md)).
- Frontend: Approve Center (`frontend/src/features/approve-center/**`) and the seven document pages (status maps, banners, Resubmit) — frontend-owned, FE-AP-009/010.

## Approval type registry

One constant (`src/approval/approval.registry.ts`) maps each `ApprovalType` to fixed SQL identifiers, so no identifier ever comes from input. It is the only place a future inventory document registers (D20).

| type | menu | header | line | parent column | party columns (id / code / name) | Stock ID expression |
|---|---|---|---|---|---|---|
| reserve | reserve | `partner.reserve` | `partner.reserve_line` | `reserve_id` | `customer_id` / `customer_code_snapshot` / `customer_name_snapshot` | `l.stock_id` |
| purchaseOrder | purchase-order | `partner.purchase_order` | `partner.purchase_order_line` | `purchase_order_id` | `vendor_*` | none |
| purchase | purchase | `partner.purchase` | `partner.purchase_line` | `purchase_id` | `vendor_*` | `l.stock_id` |
| memoReceive | memo-receive | `partner.memo_receive` | `partner.memo_receive_line` | `memo_receive_id` | `vendor_*` | `l.stock_id` |
| memoReturn | memo-return | `partner.memo_return` | `partner.memo_return_line` | `memo_return_id` | `vendor_*` | `l.stock_id` |
| memoOut | memo-out | `partner.memo_out` | `partner.memo_out_line` | `memo_out_id` | `customer_*` | `l.stock_id` |
| memoOutReturn | memo-out-return | `partner.memo_out_return` | `partner.memo_out_return_line` | `memo_out_return_id` | `customer_*` | `(SELECT o.stock_id FROM partner.memo_out_line o WHERE o.id = l.memo_out_line_id)` |

The registry order is the sidebar order the frontend uses (Q-AP-03); the backend does not depend on it.

## Code changes (implementation guide for backend)

| Area | File | Change |
|---|---|---|
| Auth view (auth owner) | `backend-api-auth/prisma/migrations/<ts>_current_authorization_user_name/migration.sql` (integration-owned path, parent-serialized) | `CREATE OR REPLACE VIEW "auth"."current_authorization" WITH (security_barrier = true) AS` the existing SELECT **plus `u."name" AS user_name` appended last**; update the view comment ("…no … personal profile fields except the session owner's display name"). Grants are unchanged. No auth code change. |
| Master auth reader | `src/master/authz-database.ts`, `src/master/auth-context.ts`, `src/master/authorization.ts` | Select `user_name`; `CurrentAuthorization.user_name: string \| null`. `principal.displayName`: a string trimmed and cut to 200 characters, else `null` (never fails auth). `permitted()` middleware passes `ctx.userName` beside `ctx.userId`. New `requireAllMasterGrants(ctx, menu, ["APPROVE","VIEW"])` and `permittedApprovalTypes(ctx)` (Super Admin = all). |
| Engine | `src/trade-document/document-engine.ts` | `EngineConfig` gains `reviewable?: true` (the seven documents). Status constants `REJECTED`, `REVISION_REQUESTED`. **create**: writes `submittedAt/By/ByName` and header totals. **update**: writes header totals (D17); editable = config `editableStatuses` (the seven pass `[PENDING, REVISION_REQUESTED]`). **review(actor, id, expectedVersion, action, note)** new: one guarded `updateMany` (status PENDING, `deletedAt: null`), miss → `explainMiss(…, [PENDING])`; logs D13. **resubmit(actor, id, expectedVersion)** new: guard status REVISION_REQUESTED, miss → `explainMiss(…, [REVISION_REQUESTED])`. **toDetail** adds `submittedAt/By/ByName` and `review`. `delete`/`restore` unchanged apart from the wider editable set. Totals are computed from the stored line values (`pcs`, `weightCt`) after `prepare`. |
| Actor | engine + the seven services | `create`/`update`/`review`/`resubmit` take `actor: {id: string; name: string \| null}` (or `actorId` + `actorName`), filled from `ctx.userId` / `ctx.userName`. `approve` keeps `actorId` only. |
| Services | `customer-stock-document.ts` (Reserve, Memo Out), `memo-receive.service.ts`, `memo-return.service.ts`, `memo-out-return.service.ts`, `purchase-order.service.ts`, `purchase.service.ts`, `reserve.service.ts`, `memo-out.service.ts` | `editableStatuses: [PENDING, REVISION_REQUESTED]`, `reviewable: true`; delegate `reject`, `requestRevision`, `resubmit`. `approve` unchanged (status PENDING guard). `PurchaseService.get`: keep `limit*`/`min*` when status ∈ editable (D10). `detailExtra` unchanged. |
| Schemas | `memo-schemas.ts` (`MEMO_RECEIVE_STATUSES`, reused by memo out / memo return / reserve / memo out return lists), `purchase.schemas.ts`, `purchase-order.schemas.ts` | Status enums add `REJECTED`, `REVISION_REQUESTED`. New `rejectInputSchema` `{id, expectedVersion, reason}` and `revisionInputSchema` `{id, expectedVersion, note}`, strict, trim 1–500. Purchase uses `withFieldErrors` like its other procedures. |
| Approval | `src/approval/approval.registry.ts`, `approval.schemas.ts`, `approval.service.ts` (new) | `summary(types)` and `pending(input)` as below; raw SQL with `Prisma.sql` / `Prisma.raw` only for registry identifiers; every value bound. Errors mapped like `documentErrors.map` (unavailable → `PARTNER_UNAVAILABLE`). |
| Router | `src/master/router.ts` | Per doc: `reject` / `requestRevision` = `permitted(menu, "APPROVE", true)`, `resubmit` = `permitted(menu, "EDIT", true)`. New `approval: t.router({summary: signedIn()…, pending: approvalPermitted()…})`. `MasterServices` adds `approval`. The `signedIn()` comment ("decimalSetup.get only; another use needs SA review") is updated to cite this bundle. |
| Wiring | `src/app.module.ts` (integration-owned), `src/master/trpc-handler.ts` | Register `ApprovalService`; pass it to the router. Parent serializes the `app.module.ts` edit. |
| Messages | `src/common/errors.ts` | Field messages for `reason` / `note`; nothing else new. |
| Schema | `prisma/schema.prisma`, migration | [database-diagram](database-diagram.md). |

## Query shapes

`approval.summary` (one statement, only permitted types appear):

```sql
SELECT 'reserve' AS type, count(*)::int AS count
  FROM (SELECT 1 FROM partner.reserve WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL LIMIT 100) s
UNION ALL
SELECT 'purchaseOrder', count(*)::int
  FROM (SELECT 1 FROM partner.purchase_order WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL LIMIT 100) s
-- … one branch per permitted type
```

`approval.pending` (one statement per page; example `reserve`, default sort):

```sql
SELECT d.id, d.doc_no, d.doc_date, d.due_date, d.version, d.customer_id, d.customer_code_snapshot, d.customer_name_snapshot,
       d.ref, d.currency_code, d.grand_total, d.line_count, d.total_pcs, d.total_weight_ct,
       d.submitted_at, d.submitted_by, d.submitted_by_name,
       d.review_action, d.review_note, d.reviewed_at, d.reviewed_by, d.reviewed_by_name, d.updated_at,
       st.names, st.distinct_count
FROM partner.reserve d
LEFT JOIN LATERAL (
  SELECT (array_agg(x.stone ORDER BY x.first_pos))[1:3] AS names, count(*)::int AS distinct_count
  FROM (SELECT l.stone, min(l.position) AS first_pos FROM partner.reserve_line l
        WHERE l.reserve_id = d.id AND l.stone <> '' GROUP BY l.stone) x
) st ON true
WHERE d.status = 'PENDING_APPROVAL' AND d.deleted_at IS NULL
  AND ( $q IS NULL OR d.doc_no ILIKE $p OR d.customer_name_snapshot ILIKE $p OR d.ref ILIKE $p
        OR EXISTS (SELECT 1 FROM partner.reserve_line l WHERE l.reserve_id = d.id AND (l.stone ILIKE $p OR l.stock_id ILIKE $p)) )
  AND ( $cursor IS NULL OR (d.submitted_at, d.id) > ($k, $i) )      -- direction/sort-specific keyset
ORDER BY d.submitted_at ASC, d.id ASC
LIMIT $limit + 1;
```

- `$p` = `'%' || escapeLike(q) || '%'` with `ESCAPE '\'` (`common/persistence.ts` `escapeLike`).
- The lateral stone subquery runs only for the ≤ 51 returned rows; lines are reached through the existing `(parent_id, position)` unique index.
- Keyset per sort: `(submitted_at, id)`, `(doc_no, id)`, `(party_name_snapshot, id)`, `(total_weight_ct, id)`, `(currency_code, grand_total, id)`; `>` for asc, `<` for desc, as a row comparison.
- Runs inside `READ_TX` (2.5 s, below the gateway's 3 s read timeout).

## Business rules

1. Reject / Revise / Approve only from `PENDING_APPROVAL`; Resubmit only from `REVISION_REQUESTED` (D1).
2. `REJECTED` is final: no update, delete, restore target, resubmit or approve.
3. None of the review transitions touch lines, charges, photos, stock tables or counters (D9).
4. The actor id/name come from the context, never from input (authorization.md).
5. A Revise overwrites the previous review; Approve does not clear it.

## Capacity (4 GB RAM / 2 vCPU host)

- No new process, pool or cache. api-master memory/CPU limits and its partner pool (≤ 5) are unchanged; the auth reader pool stays 1 and still runs exactly one query per request (one more column).
- `summary`: one statement; each branch stops at 100 index entries of a partial index → ≤ 700 index tuples per call. Expected ≤ 1 call per user per minute (focus/mutation only), replacing phase 1's 7 calls.
- `pending`: one statement; at most 51 rows returned; the lateral stone subquery touches only those rows' lines (≤ 51 × 200 line rows worst case, typically < 1 000). Search and non-default sorts scan only the pending set of one type. Response ≤ 51 rows × ~1 KB (notes ≤ 500 chars) ≈ 50 KB.
- Writes: reject/revise/resubmit are single-row statements; create/update add three computed columns (no extra statement).
- Migration: 11 columns × 7 tables, a backfill `UPDATE` of every header row (small tables; row count measured first, M-AP-02), 7 small partial indexes.
- Measurements still needed: M-AP-01 `pending` p95 per type with search and each sort on a copy of production data; M-AP-02 header/line row counts before migrating; M-AP-03 `summary` p95.

## Infra / devops

No container, image input, network, volume, variable or workflow change: no infra or devops routing. api-master and api-auth are rebuilt through the existing pipelines; the auth migration must be deployed before the master code (D21). Both security reviewers must see the auth view change (it widens what the master reader can read).
