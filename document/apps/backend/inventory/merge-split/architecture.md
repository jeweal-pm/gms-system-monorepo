# Architecture: inventory / merge-split (SA revision 1, pending-review)

```
browser ──REST /api/inventory/v1/merge-split*──► nginx ──► backend-api-inventory:3301
                                                         │  modules/merge-split/
                                                         │    routes.ts  schemas.ts  service.ts  repository.ts  read.ts  photos.ts
                                                         │  modules/stock/convert.ts  applyConversion()/reverseConversion()  ◄─ only stock writer
                                                         │  modules/stock/card-kinds.ts, card.ts (kinds + MERGE_SPLIT source)
                                                         │  platform/approval/* (summary, pending)
                                                         └─► api-master (internal): document-numbering/resolve, master-data/resolve,
                                                                                    reference (locations), stock-ids/issue (new)
```

No gateway, no new service, container, cache or job. Module layout copies `src/modules/stock-adjustment/`.

## Write path

1. Zod (strict) + grant + CSRF; normalize mode rules (SA-MS-03).
2. Before any transaction (bounded master calls, existing timeouts): `master-data/resolve` for stone code ids and locations; on first Save `document-numbering/resolve`; when the call will apply, `stock-ids/issue` with `count = results.length`, keyed `(merge-split, docId, apply_seq + 1)`. The doc id is a uuidV7 generated before the calls.
3. One `WRITE_TX` transaction: read the approval setting `FOR SHARE`; upsert doc, sources, results (replace on update); if applying, `applyConversion` (SA-MS-08); otherwise only store. Commit.
4. If the version moved between steps 2 and 3, the transaction fails with `VERSION_CONFLICT`; issued IDs replay on retry.

## Cost computation (server)

`cost.ts` of load-to-stock is reused unchanged: `sourceAmount`, `rowPriceUnit`, `rowUnitCost`. Split residue: `residue = take_cost − Σ result cost`; added to the result with the highest position of that source. Merge has one result, so no residue. Sum check: Σ IN cost = Σ OUT cost exactly per document.

## Card keys

`card_key` is generated from the stock row's stone code/attributes, location and lot. Merge/Split never updates those columns on an existing row: the source keeps its card and only its `on_hand` moves; changed details exist only on new rows. Each movement belongs to its own stock row, so Stock Card's "card of the current row" rule (ADR-0056 D11) stays correct and no `card_key` column is added to `stock_movement`. The card CTE drops documents with zero net per card, so a same-card split shows nothing; a cross-card conversion shows OUT on the source card and IN on the result card (a transfer between cards).

## Stock Value

Reads ACTIVE stock (`on_hand + reserved`) × unit cost per card. After apply the source on hand is 0 and the results carry the value; Σ value is conserved (residue is moved, not created). No code change.

## Interaction with other modules

- Load to Stock: a source with `consumed > 0` makes its load "used" (`on_hand <> pcs`), so the load can't be edited/deleted while the result exists. Results carry the source `load_id`, but `lockLoadStocks` never reverses them because the load is already in use.
- Reserve / Memo Out / Sale / Stock Adjustment / later Merge/Split on a result bump its `version`, which blocks reversal (SA-MS-11).
- Holds: `holds.ts` is not changed; held quantity is outside `on_hand` and is never taken.
