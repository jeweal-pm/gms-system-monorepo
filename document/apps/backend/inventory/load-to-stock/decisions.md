# SA decisions: inventory / load-to-stock, SA revision 1

- Feature ID / SA revision / source UI: `load-to-stock` / **1** / [UI revision 1](../../../frontend/load-to-stock/ui-spec.md) (draft) with the [owner answers of 2026-11-16](../../../frontend/load-to-stock/open-questions.md#owner-answers-2026-11-16)
- Status: **pending-review** — complete draft bundle awaiting owner approval. UI approval does not approve this bundle. Revised 2026-11-16 (same SA revision 1, not yet approved) with the owner answers to Q-LS-23/26/28/29/30/33 and source image 06.
- Approval evidence: none. Owner direction 2026-11-16: "spec api คือสร้าง service ใหม่เลยไม่รวมกับ master"; "ทำเอกสาร ออก adr diagram".
- ADR: [ADR-0052](../../../../adr/0052-load-to-stock-in-backend-api-inventory.md) (Proposed). Open questions Q-LS-23…33 are listed there.
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Flow: [diagram/load-to-stock-flow.md](../../../../diagram/load-to-stock-flow.md). TODO: [task/todo/load-to-stock.md](../../../../task/todo/load-to-stock.md) (BE-LS-*). Infra/devops: [load-to-stock-infra-devops](../../../../coordination/handoffs/load-to-stock-infra-devops.md).
- Earlier inventory design reused: [inventory/gms-platform](../gms-platform/architecture.md) (approved-design, no slice). Divergences are listed below.

## Owner inputs and how they are read

| Owner text / answer | Reading in this design |
|---|---|
| "เราไม่จำเป็นต้องโหลดของใน Puchase ทั้งหมด … load ไป 7 ชิ้น … จะเหลือ 3 ชิ้น … จะหายไปต่อเมื่อ pcs เป็น 0" | Partial loads. Remaining = PU line qty − loaded by applied loads; a line leaves the picker when remaining pcs = 0 (SA-LS-02, SA-LS-10). |
| "ถ้ามี approve ก็รอ approve ก่อนถึงจะตัด purchase เเละเพิ่มของเข้าคลัง ถ้าไม่มีก็ตัดเลย … เเก้ไขได้ลบได้จนกว่าของจะถูกนำไปใช้" | ADR-0050: ON → apply at Approve; OFF → apply at Save, edit/delete until used (SA-LS-05, SA-LS-06). |
| "spec api คือสร้าง service ใหม่เลยไม่รวมกับ master" + owner-selected boundary | `backend-api-inventory` (SA-LS-01). Master keeps Purchase, the counter and Document Setup; inventory reaches them by an internal API only. |
| Q-LS-07 "1 ใบ 1 โหมดเท่านั้น" | Header `mode`; no batch id (SA-LS-09). |
| Q-LS-08 mixed units, ≥ 2 rows, highest price shown | Merge rules (SA-LS-09); measure = Q-LS-27. |
| Q-LS-23 "ตาม company profile currency" | Header currency = Company Profile currency, read-only; Stock/Sale Price and cost in it (SA-LS-08). |
| Q-LS-26 "ถ้า pcs เป็น 0 จะไม่แสดงแล้ว … weight เป็น 0 ทำได้ …" | Loadable only while remaining pcs > 0; row pcs ≥ 1; row weight 0 only when the source weight is 0 (SA-LS-10). |
| Q-LS-28 "เป็นช่องว่างที่ต้องเลือกเหมือนช่อง stone shape" | Required select starting empty, options from master's Location Master (other branch); no seed row (SA-LS-11, Q-LS-34). |
| Owner 2026-11-16 follow-up: Location Master is in Setup › Master Code like the other masters | Location is master-owned (ADR-0053, merged); inventory reads/validates it like stone data and stores the name snapshot (SA-LS-11). |
| Q-LS-36 option A | Keep `backend-api-inventory`; moving only Memo Receive considered, not adopted (ADR-0052). |
| Q-LS-29 "เหมือน memo receive 260001" | `YY####` confirmed (SA-LS-03). |
| Q-LS-30 "ได้ ปุ่ม from stock ทั้งหมด คือ stock นี้ + memo stock" | Own stock in every customer-side From Stock picker, phased (SA-LS-17). |
| Q-LS-33 "… user นำกลับมาเองไม่ได้ งั้นไม่ต้อง" | No Restore of Load to Stock (SA-LS-06). |
| Q-LS-03 several PUs/currencies, one vendor | `vendor_id` on the header; every source's PU must have it (SA-LS-08). |
| Q-LS-12 "ก" | Cost by price unit at PU rate (SA-LS-10). |
| Q-LS-11/13/14 | Location required; Stock/Sale Price required, empty; PU photos copied, ≤ 5 (SA-LS-04, SA-LS-11, SA-LS-13). |
| Q-LS-04 default | Stock ID issued when the stock is created; "Auto" before; never reused (SA-LS-03). |

## Decisions

| ID | Decision |
|---|---|
| SA-LS-01 | **Service.** `backend-api-inventory` (Hono + `@hono/node-server`, Node 24.22.1 base like master), Compose/DNS `backend-api-inventory`, port 3301, schema `inventory`, public base `/api/inventory/v1` via nginx. Module `src/modules/load-to-stock/`; shared kernel `src/platform/` (auth, CSRF, errors, db, storage, master client, notifications, approval). Other sidebar modules join this process later with their own tables. |
| SA-LS-02 | **PU remaining and deduction.** Master owns `purchase_line.loaded_pcs/loaded_weight_ct` and the allocation ledger; inventory applies through the idempotent `PUT /internal/v1/inventory/load-allocations/{loadId}` (set semantics, monotonically increasing `revision`, request hash) and a local saga (`master_sync_op`, `sync_state`). Drafts/pending hold nothing. Remaining is re-checked under master row locks at every apply. |
| SA-LS-03 | **Stock ID.** Issued by master in the allocation transaction from `memo_stock_id_counter` (`YY####`), one per new load row, at Save (OFF) / Approve (ON). Registry `partner.load_stock_id`. `issueStockIds` takes a fixed advisory lock and reads the clock after it (both callers). Never reused. |
| SA-LS-04 | **Stock record.** `inventory.stock` (one per Stock ID), `inventory.stock_photo`, append-only `inventory.stock_movement`. Created at apply from the load row (1:1 via `load_row_id`). Fields: location, parcel, stone code + attributes, lot, cer, price unit, pcs, weight, on-hand pcs/weight, company-currency cost unit/amount, stock price, sale price, vendor snapshot, note, `first_used_at`. |
| SA-LS-05 | **Approval.** ADR-0050 D2 status model and D6 Daybook. Setting rows for inventory types owned by inventory (Q-LS-25 default), read `FOR SHARE` in Save/Submit; `PUT /approval-settings/{type}` locks the row and refuses OFF while documents wait (`APPROVAL_SETTING_HAS_WAITING`). Approve Center endpoints in inventory with master's shapes; frontend merges. |
| SA-LS-06 | **Edit/delete until used.** Approval OFF: auto-approved loads editable/deletable while none of their stock is in use (`on_hand_pcs <> pcs OR on_hand_weight_ct <> weight_ct`, current state); edit = one re-apply call with the new allocation set; delete = release all + reverse stocks + soft delete. **No Restore** (owner Q-LS-33): deleted loads stay in the Deleted filter, read-only. Master: Purchase is used when any line has loaded > 0 (`PURCHASE_IN_USE`). |
| SA-LS-07 | **Numbering.** Document Setup `load-to-stock` (code LS) stays in master; inventory resolves the row in effect via internal API (`markUsed` at Save sets `document_numbering.external_used_at`) and computes `max+1` locally under an advisory lock. Preview via `GET /load-to-stock/next-number`. |
| SA-LS-08 | **Account / currency.** Account = vendor (Q-LS-01). One vendor per document, any number of PUs/currencies. Header currency = **Company Profile currency** (read from master `reference`, snapshot `currency_code`), read-only (owner Q-LS-23). Stock/Sale Price in it; cost converted to it at each PU's rate. |
| SA-LS-09 | **Mode persistence.** `load_to_stock.mode` NONE/SPLIT/MERGE; `load_to_stock_source` (picked PU lines + snapshots), `load_to_stock_row`, `load_to_stock_row_source` (row ↔ source quantities). NONE: exactly one row per source and one source per row. SPLIT: ≥ 1 row per source, one source per row. MERGE: exactly one row with ≥ 2 sources, each at its full remaining qty. |
| SA-LS-10 | **Cost and write-off.** Unit cost (company currency) = net unit price × PU rate (4 dp half-up); source amount = basis × unit cost (2 dp half-up), basis = weight (PER_CT) or pcs (PER_PCS); row cost = Σ sources; row unit price = cost ÷ row basis. Line closes when remaining pcs = 0; leftover weight is written off (not recorded as a separate bucket; derived as `weight − loaded_weight` on a closed line). Weight-only lines per Q-LS-26. |
| SA-LS-11 | **Location** (ADR-0052 D11, aligned with ADR-0053). Required select, empty at start; PU line location shown read-only in the Item table. Options = master active names (`reference.locations: string[]`); Save validates names case-insensitively via `master-data/resolve` and stores master's spelling as `varchar(40)` text on rows and stock (no id/FK); an update may keep a row's already-stored name. Parcel = optional text ≤ 50. |
| SA-LS-17 | **Own stock in From Stock (Q-LS-30), phased** (ADR-0052 D15). Phase 1 (this revision): `stock` buckets reserved / memo_out / sold / consumed + CHECK `pcs = on_hand + Σ buckets` (same for weight), table `stock_hold`, current-state in-use rule. Phase 2a: Quotation reads own stock (`GET /stock/available`, no hold). Phase 2b: Reserve / Memo Out / Memo Out Return hold through `PUT /internal/v1/master/stock-holds/{documentType}/{documentId}` with a master-side saga. Phase 3: Sale. Purchase STOCK rows and Memo Return stay Memo-Stock-only (Q-LS-35). Phases 2–3 each need their own UI + SA revision. |
| SA-LS-12 | **Security, audit, capacity, delivery.** Leaf `load-to-stock`: VIEW / ADD / EDIT / DELETE / APPROVE (no PRICE masking, consistent with Purchase). CSRF on mutations, per-request live authorization, structured logs without prices/notes. Container 0.20 vCPU / 256 MiB / heap 160 / pool 5+1. Infra + devops requirement prepared. |
| SA-LS-13 | **Photos.** `@gms/storage` fs, prefix `files/load-to-stock/`, own storage root, metadata `inventory.stored_file` (`source_type` `load-to-stock.row-photo`), ≤ 5 per row, JPEG/PNG ≤ 5 MB. Copy from PU lines once per master file (dedupe on `origin_file_id`). Permanent retention; UI removal unlinks only. |
| SA-LS-14 | **Notifications.** Inventory-owned feed + SSE (`streamSSE`) as ADR-0049, recipients from `auth.permission_holders`, written in the status-change transaction (same database and service, no outbox). Q-LS-32. |
| SA-LS-15 | **Transport.** REST JSON + Zod; no tRPC; frontend client in `frontend/src/features/load-to-stock/api.ts` with response Zod schemas mirroring this contract. |
| SA-LS-16 | **Auth integration.** jose JWT verify (auth JWKS, bounded cache), `gms_inventory_authz_reader` role (select on `auth.current_authorization`, `auth.permission_holders`), license check through auth with `INVENTORY_AUTH_SERVICE_TOKEN`. Inventory → master calls use a separate `INVENTORY_MASTER_SERVICE_TOKEN`; the legacy `PARTNER_SERVICE_TOKEN` is not reused. |

## Divergence from the earlier inventory design (gms-platform rev 1)

| Earlier (approved-design candidate) | This revision | Reason |
|---|---|---|
| Name `api-inventory` | `backend-api-inventory` | Owner-selected runtime/DNS name |
| Generic item/SKU/unit/lot + `stock_balance` | `stock` per Stock ID with on-hand columns + movements | Gem lots are unique per Stock ID; no SKU/unit data exists |
| `doc_counter` table | `max(running_no)+1` per master numbering row | Master Document Setup owns numbering (prefix/period) |
| `Idempotency-Key` header stored 24 h | `expectedVersion` on every mutation + idempotent master revision | Same protection as every existing document; no purge job needed |
| Storage soft-delete 30 days (ADR-0027 D3) | Permanent retention | ADR-0030 supersedes |
| Pool ≤ 10, 256 MiB | Pool 5 + 1, 256 MiB, 0.20 vCPU | Matches master; host budget |

## Suspicious or contradictory points in the source documents

| # | Where | Finding | Handling |
|---|---|---|---|
| S-01 | ui-spec M-09/M-10, FE-LS-008 | "Stock Price defaults to Price; Sale Price optional" | Owner Q-LS-13 overrides: both required, empty. ui-spec/TODO text should be updated by ui-spec. |
| S-02 | ui-spec M-12, Q-LS-14 default | "PU photos not copied" | Owner answer: copied. Contract follows the owner. |
| S-03 | data-fetching create payload `batchId, mode` per row; FE-LS-001 `batchId` | Per-batch modes | Owner Q-LS-07: one mode per document; contract has header `mode` only. |
| S-04 | error-handling "Merge disabled … mixed price units" | Contradicts Q-LS-08 | Mixed units allowed; Merge disabled only with < 2 lines. |
| S-05 | Design "SL-0311" | Stock ID format differs from `YY####` | Q-LS-29. |
| S-06 | Header "Currency * USD" with THB values | Unclear meaning | Q-LS-23. |
| S-07 | UI "Pcs ≥ 1, Weight > 0" | PU allows pcs 0 or weight 0 lines → unloadable | Q-LS-26. |
| S-08 | ui-delivery.md and backend/architecture.md say "1.70 vCPU / 2944 MiB" | Compose and capacity.md say 1.55 / 2624 | This design uses Compose; the two documents need a refresh (parent). |
| S-09 | ADR-0049 D10 `/api/inventory/notifications/stream` | No `/v1` | Path set to `/api/inventory/v1/notifications/stream` (ADR-0052 D12). |
| S-10 | ADR-0051 closed INV-20261113-001 Part B by removing the second issuer | Load to Stock is a second issuer again | Fixed by the serialized issuing (SA-LS-03); test IT-LS-B08. |
| S-11 | Approve Center / Approval Setup today assume one service | Inventory types now come from inventory | Frontend merge items FE-LS-011/014. |
| S-12 | Source 06 mode dialog | Split card "one load row per PU line … 3 load rows → 3 stocks" is consistent with one mode per document (Split starts with one row per line; + Split adds children). The dialog must still enforce the document mode on later picks: the other cards disabled with "This document is in {mode} mode" (a Merge document adds the new lines into its one merged row). Primary button for Merge reads "Merge · create 1 load row" (ui-spec said "Create 1 load row"). None card text mentions "no Load ▸" (no such action, Q-LS-15). | ui-spec text update; contract unchanged. |
| S-14 | Migration `20261116090000_location_master` comment says "ADR-0052" | It means ADR-0053 (Location Master); ADR-0052 is this Load to Stock ADR | Noted in ADR-0052 header; applied migration files are not edited (as ADR-0050 did) |
| S-13 | ADR-0045 item 8 (Restore for every future document) | Owner Q-LS-33: no Restore for Load to Stock | ADR-0052 D9 amends it for this type. |

## Backend addendum (2026-11-17, INV-20261117-003 F2, owner "แก้ F1 F2")

| ID | Rule |
|---|---|
| SA-LS-18 | **Stock consumers must refuse stock of a syncing load.** Every future writer of own stock (merge-split, stock transfer, stock adjustment, sale, the D15 phase-2b hold API) locks the stock rows `FOR UPDATE` and refuses (`LOAD_TO_STOCK_BUSY`-style 409 / its own `_BUSY` code) when the stock's load has `sync_state = 'SYNCING'`. Load to Stock additionally re-checks "not in use" inside its apply transaction under the same locks and parks the op `STUCK` instead of reversing used stock (defence in depth). |
