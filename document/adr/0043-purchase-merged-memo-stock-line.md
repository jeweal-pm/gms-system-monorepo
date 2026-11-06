# ADR-0043: Merged Memo Stock line on a Purchase

- Status: Accepted
- Date: 2026-11-05
- Feature / source UI revision: `purchase` / UI revision 3
- SA revision: 2
- Deciders: project owner
- Approval evidence: owner 2026-11-06: "อนุมัติ purchase revision 3"
- Supersedes / related ADRs: extends [ADR-0042](0042-purchase-document-and-stock-deduction.md) (D1 bucket and D2 cut at Approve unchanged); [ADR-0034](0034-memo-receive-approval-and-memo-stock.md)

## Context

In Add Memo Stock on the Purchase page, a Memo Stock item can show twice: once in "Sold to customers · must be purchased" (sold − purchased) and once in "Still in stock on memo" (pending). The owner asked on 2026-11-05 that picking both parts of the same Stock ID asks "Merge?" after OK. Merge makes one row whose Pcs/Weight can't go below the Sold part and whose purchase settles the Sold part first. Don't merge keeps two rows. A Sold row on its own should allow only the price to change (today nothing on it can be edited). Bundle: [ui-spec rev 3](../apps/frontend/purchase/ui-spec.md#revision-3-merge-the-sold-and-in-stock-parts-of-one-item-pending-review), [SA rev 2](../apps/backend/master/purchase/decisions.md#sa-revision-2-proposed-2026-11-05-merged-memo-stock-lines), [TODO](../task/todo/purchase.md#revision-3-merge-sold--in-stock-pending-review).

## Decision

1. A `STOCK` purchase line gets a third memo group, `MERGED`, meaning "this item's Sold part, plus part or all of its In-stock part". One item is on a purchase either as one MERGED line or as separate SOLD / IN_STOCK lines.
2. Save checks `soldOpen ≤ q ≤ soldOpen + pending` for pcs and weight separately, without a lock, and moves nothing.
3. Approve, under the existing row lock, takes the Sold part first (`soldOpen`) and the rest from pending. The memo_stock effect is the sum of a SOLD line and an IN_STOCK line, so the balance CHECKs, Memo Outstanding › Vendor and the rev 1 rules are unchanged.
4. The parts actually taken are stored on the line at Approve (`sold_part_pcs`, `sold_part_weight_ct`) for display.
5. A SOLD line must buy the whole Sold part (pcs and weight fixed); only price and item note come from the user.
6. The pairing and the Merge question are frontend-only; the picker query is unchanged.

## Alternatives

- **Two hidden lines behind one visible row** (frontend groups a SOLD and an IN_STOCK line): no schema change, but the minimum rule and "sold first" depend on two lines staying in step, totals and the line count show two items, and editing one row means splitting the quantity in the browser.
- **Split decided at Save** (store sold/stock parts when saving): simpler approve, but wrong when the Sold quantity changes before approval; the owner's rule is "sold first" at the time of buying.
- **Merge by matching details across Stock IDs**: rejected for now; Stock IDs identify the physical stone (Q-PU-24).

## Consequences and capacity

- Migration `20261106090000_purchase_merged_line`: two nullable columns and two CHECK changes on `purchase_line`; additive. Rollback is possible while no MERGED line exists.
- No new query, index, service, container or package. Approve still locks each touched item once; Save reads nothing extra.
- Older purchases are unaffected (IN_STOCK / SOLD lines keep their meaning).

## Acceptance and approval

- UT-PU-12…16, TC-PU-14/15 (frontend); backend tests for SA-PU-21…26 (save bounds, sold-first approve, short refusal, SOLD exact quantity, CHECKs).
- Covers UI revision 3, SA revision 2 and this ADR. Accepted 2026-11-06.
