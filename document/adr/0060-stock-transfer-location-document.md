# ADR-0060: Stock Transfer Location document in `backend-api-inventory`: moving own stock to another location as a new Stock ID

- Status: **Accepted** 2026-11-24 (owner "อนุมัติ" in chat, 2026-11-24, after the new-Stock-ID-for-every-transfer note)
- Date: 2026-11-24
- Feature / source UI revision: `stock-transfer-location` / owner design images in [apps/frontend/stock-transfer-location/source/](../apps/frontend/stock-transfer-location/source/) (no separate ui-spec; the UI rules are in D12 below)
- SA revision: 1 (this ADR is the whole design bundle; the owner implements it)
- Deciders: project owner
- Approval evidence: owner "อนุมัติ" in chat, 2026-11-24 (ADR-0060 as written, including D3: a whole move also creates a new Stock ID). Owner request 2026-11-24: "stock-transfer-location คือ การดึง stock เรามาเปลี่ยน location ใส่จำนวนน้ำหนักที่จะเปลี่ยนได้ เมื่อ save หรือ approve เเล้วของจะเปลี่ยนlocation และอยากให้ขึ้นใน outstanding ด้วยว่าของถูกนำออกด้วย Transfer location No หรือ ของมีการนำเข้ามาด้วย Transfer location No นี้ ออก adr มาอันนี้ฉันจะทำเอง". Owner answers the same day:
  - "outstanding" = **Stock Card**.
  - A partial move = **a new Stock ID**.
  - **One lot per row**.
- Supersedes / related ADRs:
  - [ADR-0050](0050-approval-setting-draft-send-to-approve.md): approval flow.
  - [ADR-0052](0052-load-to-stock-in-backend-api-inventory.md): D1 module placement, D5 Stock IDs issued by master, D8 approval setting, D10 numbering.
  - [ADR-0045](0045-transaction-document-soft-delete.md): soft delete.
  - [ADR-0053](0053-location-master.md): locations.
  - [ADR-0055](0055-lot-based-stock-picking-and-allocation.md): own lot = one Stock ID.
  - [ADR-0056](0056-stock-card-report-in-inventory-service.md): D3 card identity, D11 new ledger kinds.
  - [ADR-0057](0057-stock-value-report-in-inventory-service.md): Stock Value.
  - Sibling ADR-0059 Stock Adjustment, on branch `feat/24-11-26-stock-adjustment`. Both add ledger kinds; whichever merges second must merge the `stock_movement_kind_check` list.

## Context

**What the owner wants:**
- The user picks lots of **our own stock** (from Load to Stock), chooses a **New Location** per row, and types the **Pcs / Weight** to move. The amount can be up to the whole on-hand quantity.
- After Save (approval OFF) or Approve (approval ON), the stones are at the new location.
- **Stock Card** shows the stones leaving the old location (OUT) and arriving at the new one (IN), both under the Transfer Location No.

**What the code does today:**
- `inventory.stock` is one row per Stock ID. Its `location` column is part of the generated `card_key` (stone code + location + lot), and Stock Card groups by `stock.card_key` (`src/modules/stock/card.ts`).
  - **If we only changed `stock.location`, the stone's whole history (its LOAD_IN etc.) would jump to the new location's card, and the old card would show no OUT.**
  - So a transfer must leave the old row where it is and create a new row.
- The quantity rule is the `stock_pcs_balance_check`: `pcs = on_hand + reserved + memo_out + sold + consumed` (the same for weight).
- `stock_movement` is append-only, with kinds fixed by `stock_movement_kind_check`.
- Stock IDs are issued **only by master** (`issueStockIds`, `backend-api-master/src/trade-document/memo-receive.service.ts:81`, ADR-0052 D5; never reused).
- Already present:
  - the approval type `stock-transfer-location` (`INVENTORY_APPROVAL_TYPES`, `src/platform/approval/settings.ts:11`);
  - the Document Setup key `stock-transfer-location` with default code **ST** (`document-setup.transactions.ts:16`; the image's `LTGMS2609001` is mock data);
  - the permission leaf and the menu placeholder.

## Decision

- **D1 Placement:** module `backend-api-inventory/src/modules/stock-transfer-location/` with REST `/api/inventory/v1/stock-transfer-location*`.
  - Stock rows are written only through a new `src/modules/stock/transfer.ts` (the rule in `stock.ts`).
  - The only master calls are numbering and Stock ID issue, both made **before** the transaction.
- **D2 Data:**
  - `inventory.stock_transfer`: `id, doc_no, doc_date, ref ≤100, note ≤250, status, auto_approved, revision_count, submitted_*, review_*, applied_at, version, deleted_*, created_*, updated_at`.
  - `inventory.stock_transfer_line`:
    - `id, transfer_id, position, from_stock_uuid` (FK `stock.id`, **unique per transfer**: one lot per row);
    - `from_location` (snapshot), `on_hand_pcs` / `on_hand_weight_ct` (snapshot at pick);
    - `to_location`, `pcs` (int ≥ 0), `weight_ct` (≥ 0, at least one > 0);
    - `new_stock_uuid` (nullable FK `stock.id`, set on apply);
    - `applied_from_version`, `remark`.
  - `inventory.stock` gains `transferred_from_uuid uuid NULL` (FK `stock.id`) so that the origin can be traced.
- **D3 Every transfer creates a new Stock ID**, partial or whole:
  - **Source row:** `pcs -= x`, `on_hand_pcs -= x` (the same for weight), `cost_amount_base -= share`, `version + 1`, `first_used_at = coalesce(first_used_at, now())`. A whole move leaves it at on hand 0, so it drops out of every picker (open-stock index).
  - **New row:**
    - Copies every stone attribute: `price_unit`, `unit_cost_base`, `stock_price`, `sale_price`, `currency_code`, `vendor_*`, `load_id`, `ref_doc_date`, `ref_doc_no`, `item_note`, `lot`, `parcel`.
    - Also copies the photos reference (by reference, not copy, per ADR-0048).
    - `location = to_location`, `pcs = on_hand_pcs = x` (the same for weight), `load_row_id = NULL`, `transferred_from_uuid = source`, and a new `stock_id` from master. `cost_amount_base` gets the moved share.
    - Keeping `ref_doc_date` keeps the lot's FIFO age.
  - Cost share = `round(cost_amount_base × moved qty ÷ on-hand qty by price_unit, 2)`. A whole move takes the remainder, so the total cost never changes.
- **D4 Ledger:**
  - Kinds `TRANSFER_OUT` (source, negative deltas) and `TRANSFER_IN` (new row, positive deltas), plus `TRANSFER_OUT_REVERSAL` / `TRANSFER_IN_REVERSAL`.
  - They are added to `stock_movement_kind_check` with `document_type = 'stock-transfer-location'`.
  - One OUT row and one IN row are written per line.
- **D5 Stock Card** (the owner's "outstanding"):
  - Add the four kinds to `CARD_KINDS` (MOVEMENT).
  - Add `DOCUMENT_TYPES["stock-transfer-location"] = { label: "Stock Transfer Location", stockIdVisible: true, source: "TRANSFER" }`. The new source `TRANSFER` reads the doc no and date from `inventory.stock_transfer`, and the Account column shows `→ <to_location>` on OUT and `← <from_location>` on IN.
  - The DOC NO link opens `/inventory/stock-transfer-location/{id}`.
  - Result: the old card shows OUT and the new card shows IN, both with the ST number. Stock Value needs no change, because on hand moves between cards and the total value is unchanged.
- **D6 Stock IDs from master:** new internal endpoint `PUT /internal/v1/inventory/stock-id-issues/{documentType}/{documentId}` with body `{ revision, count ≤ 200 }`, returning `{ revision, stockIds, replayed }`.
  - It is idempotent per (document, revision): a replay returns the same IDs. It stores the issue in a small master table `stock_id_issue` and reuses `issueStockIds`.
  - It is called before the inventory transaction for the lines being applied. If the transaction fails, the retry replays the same IDs. IDs from an abandoned revision are never reused (gaps are allowed, ADR-0052 D5).
- **D7 Apply**, in one transaction:
  1. Lock the source stocks `FOR UPDATE ORDER BY id`.
  2. Check each one: ACTIVE, own stock, `location = from_location`, `on_hand ≥ moved` for pcs and weight, and `to_location ≠ from_location` and an active Location Master name.
  3. One set-based UPDATE of the sources.
  4. One INSERT … SELECT of the new rows.
  5. One INSERT of the ledger rows.
  6. Write `new_stock_uuid` / `applied_from_version` back to the lines.
  7. Set the document to APPROVED.
  - A failed check returns `409 STOCK_TRANSFER_EXCEEDS_ON_HAND {lines:[{lineId, onHandPcs, onHandWeightCt}]}` or `422 STOCK_TRANSFER_LINE_UNAVAILABLE {lineIds}`, and nothing is written.
  - Reserved / memo-out / sold quantities are never moved. Only on hand can be transferred.
- **D8 Approval** (ADR-0050):
  - The type already exists, but the DB check and the Approval Setup UI must enable it. The UI currently lists it as unavailable in `frontend/src/features/approval-setup/model.ts:11`.
  - OFF → Save applies at once (APPROVED, auto). ON → DRAFT → submit (read-only re-check) → PENDING_APPROVAL → Approve applies. Revise at most once; Reject is final.
  - `/approval/summary` and `/approval/pending` include the type, and Approve Center gets a panel (`approve-center/menus.ts` placeholder).
- **D9 Edit / delete after effect:**
  - This is allowed only if every new stock is untouched (`version = 1`, `on_hand = pcs`, no hold or movement besides TRANSFER_IN) and every source has `version = applied_from_version`. Otherwise return `409 STOCK_TRANSFER_IN_USE {stockIds}`.
  - The reversal adds the quantity back to the source, marks the new row `status = 'REVERSED'` with on hand 0 and pcs 0 (it satisfies the balance check, as `reverseStocks` does), and writes the `*_REVERSAL` kinds.
  - Then the edit re-applies (with a new revision and new IDs), or the delete soft-deletes (ADR-0045).
- **D10 Numbering:** master `document-numbering/resolve` gets the allowed key `stock-transfer-location` (master `INVENTORY_NUMBERING_KEYS`, inventory `NumberingKey`). The default code is **ST**, and the number is issued on the first Save.
- **D11 From Stock picker:**
  - New `GET /stock-transfer-location/stock?q=&location=&exclude=&cursor=&limit=` on `lotsAvailablePage` (`modules/stock/lots.ts`). It returns own stock only, ACTIVE, on hand > 0, at **any** location (an optional `location` filter), excludes the lots already on the document, and pages by keyset with ≤ 50 rows.
  - The frontend reuses the `MemoStockModal` dialog through a new data-source prop variant (the same pattern as ADR-0059 FE-SAJ-004; whichever lands first adds it).
- **D12 UI** (owner images 01–03):
  - **Header:** "Transfer Location No.:" + number + barcode icon, Create New / Cancel / Save / Edit / Delete; Print / Excel / Duplicate disabled in rev 1.
  - **Info card:** Doc Date * and Ref.
  - **"Item" card:** "N items", a **From Stock** button and a barcode-scan button; 5 empty rows ("Empty row · click to pick from stock"); no Add row.
  - **Grid, left part (read-only):** checkbox, ⊖, #, Stone Code, LOCATION, LOT, PCS, WEIGHT, PRICE (amount + currency, sub-line `per cts` / `per pcs`).
  - **Grid, right part, teal group:**
    - NEW LOCATION: a dropdown of active locations except the row's own.
    - PCS / WEIGHT: inputs, empty at pick with placeholder 0.
    - Rules: PCS integer 0…on hand, WEIGHT 0…on hand (3 dp), and at least one > 0. Typing PCS equal to on hand fills WEIGHT with the on-hand weight. Otherwise the two are independent.
  - **Row states (image 03):** default, hover (light grey), selected (light teal).
  - **Save requires:** Doc Date, ≥ 1 picked row, and every picked row with a New Location and an amount.
- **D13 Bounds:**
  - ≤ 200 lines per document; one lot per row (unique `from_stock_uuid`).
  - JSON ≤ 256 KiB.
  - No HTTP call inside a transaction.
  - ≈ 6 statements per apply.
  - No new package, container or cache.

## Implementation checklist (owner builds)

**Backend (inventory)**
1. Migration:
   - the two tables;
   - `stock.transferred_from_uuid`;
   - the kind check (+4 kinds);
   - the approval-type DB check if it lacks `stock-transfer-location`;
   - indexes on the daybook `(doc_date desc, id desc) WHERE deleted_at IS NULL`, on pending status, and on `stock_transfer_line(from_stock_uuid)` and `(new_stock_uuid)`.
2. `modules/stock/transfer.ts`: `applyTransfer` and `reverseTransfer` (D3, D4, D7, D9).
3. `modules/stock-transfer-location/{routes,schemas,service,repository,read}.ts`, copying `modules/sale/`:
   - options (locations from `master.reference()`), next-number, list, get, stock picker;
   - create, update, submit, approve, request-revision, reject, delete, restore.
   - Mount the routes in `src/app.ts`.
4. `NumberingKey` and the Stock ID issue client in `platform/master-api.ts`; `Menu` type in `platform/auth/principal.ts`; approval summary/pending.
5. `modules/stock/card-kinds.ts` + `card.ts`: the 4 kinds, the document type, and the `TRANSFER` source (D5).

**Backend (master)**

6. Add `stock-transfer-location` to `INVENTORY_NUMBERING_KEYS`. Add the new `stock-id-issues` endpoint and the `stock_id_issue` table (D6).

**Frontend**

7. Route `frontend/src/app/(app)/inventory/stock-transfer-location/{page.tsx,[id]/page.tsx}`. The feature folder is `frontend/src/features/stock-transfer-location/` (page, table, form, api). Copy `load-to-stock`.
8. `MemoStockModal` data-source variant; Approval Setup enables the type; Approve Center panel; `flow-status.ts`.
9. `features/home/navigation.ts`: link Inventory › Stock Transfer Location to the real page.

**Tests** (per `workflow/automated-testing.md`)
- Partial move: the new Stock ID has the moved qty, the source keeps the rest, the balance check holds, and the cost is split exactly.
- Whole move: the source has on hand 0 and is gone from the pickers.
- Stock Card: the old card shows OUT and the new card shows IN with the ST number.
- On hand changed after pick → 409, nothing written.
- Approval ON/OFF.
- Edit/delete reverse, and IN_USE after the new stock was used.
- Stock ID issue replay returns the same IDs.
- Picker filters.
- Permission and CSRF per route.

Then run both security reviews on one source revision and a manual test.

## Alternatives

- **Change `stock.location` in place for a whole move:** rejected. It rewrites Stock Card history (the card is keyed by the row's current location), and the old location would never show the OUT the owner asked for.
- **Keep one Stock ID and record a location per movement:** this would need the Stock Card, Stock Value and every picker to compute location from the ledger. It is a much larger change on a 2 vCPU host.
- **Generate Stock IDs in inventory:** rejected. ADR-0052 D5 keeps one issuer (master) so IDs never collide with Memo Receive / Load IDs.
- **Several destinations for one lot in one document:** the owner chose one lot per row. Splitting to two locations takes two documents, or one move followed by another.

## Consequences and capacity

- Each line adds one stock row and two ledger rows. A 200-line transfer is ≈ 6 statements in one short transaction plus one master call (two on the first Save: number and IDs).
- Stock IDs grow with transfers. That is acceptable (varchar(10) `YY####` is the existing format, and master owns overflow rules).
- Pickers in other documents see the new Stock ID at the new location right away. A whole move hides the old ID.
- Rollback: drop the new tables and column and restore the old kind list while no `TRANSFER_*` rows exist.
- There is no new container, cache or job, which fits the 4 GB / 2 vCPU host.

## Acceptance and approval

The acceptance checks are the test list above. Accepted 2026-11-24 with the evidence recorded in the header.
