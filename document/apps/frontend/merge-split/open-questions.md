# Open questions: merge-split (UI revision 1)

Status: **pending-review** (draft for owner review). Already given by the owner on 2026-11-27: the page looks like Load to Stock, it merges or splits **our own stock**, and it has one source button **From Stock** listing our own stock only. Every row below carries a **recommended default** that the spec already applies; approving revision 1 "with the defaults" accepts all of them.

| ID | Question | Recommended default | Alternatives | Affects |
|---|---|---|---|---|
| Q-MS-01 | **Picker granularity and Stock ID display.** Approved `lot-based-stock` Q-LOT-10 says the Stock ID is shown nowhere. Merge/Split acts on Stock IDs. | **One row per own Stock ID, Stock ID shown on this page** (exception to Q-LOT-10, like Stock Card Q-SC-01). Own stock is already one lot key per Stock ID (ADR-0055 `OS`+id), so rows = lots; only the label adds the Stock ID. | Hide Stock ID, show Lot only (rows are the same) | P-01, IT-2, RT-3 |
| Q-MS-02 | What is "available"? | **On hand only.** Reserved, Memo Out, sold and consumed quantities stay on the source and are never offered. A partly held stock offers its on-hand part. | Exclude any stock with a hold | P-01, BE-MS |
| Q-MS-03 | Is **None** offered? | **No.** Only Split and Merge; None would be a no-op (moves → Stock Transfer Location, quantity → Stock Adjustment). | Keep None for detail/location correction | P-02 |
| Q-MS-04 | **Split remainder**: may part of the source stay on the source Stock ID? | **No.** Σ children must equal the source's available pcs **and** weight; ≥ 2 children. To keep part "as is", add a child with the same details (it gets a new Stock ID). | Allow a remainder (children ≤ available) | S-02, S-04 |
| Q-MS-05 | Split cost allocation | **By weight** (per ct) or **by pcs** (per pcs) at the source unit cost; last child takes the rounding difference. | Allocate by a typed percentage | C-01 |
| Q-MS-06 | Which details may change on a new stock? | **All**: stone code, stone, shape, size, grading (color, clarity, cutting, quality), cer, lot, location, stock/sale price, note, photos. | Lock stone/grading for Split | M-02…M-10 |
| Q-MS-07 | Default location | **Split**: the source location; **Merge**: empty, must be chosen (sources may differ). | Merge: suggested source's location | RT-4 |
| Q-MS-08 | Merge cost | **Weighted average**: Σ source cost ÷ Σ weight (per ct) or Σ pcs (all per pcs); mixed units → per ct (Load Q-LS-27). | Block mixed units | C-02 |
| Q-MS-09 | Can sources at **different locations** or with different stone codes be merged? | **Yes**, any own stocks; the user chooses details. | Same stone code / location only | P-02 |
| Q-MS-10 | Stock / Sale Price on new stocks | **Prefilled** from the source (Merge: suggested source), required, editable. | Empty and required (as Load Q-LS-13) | M-09/M-10 |
| Q-MS-11 | Photos | Copied from the source (Merge: suggested source), editable ≤ 5. | Start empty | R-02 |
| Q-MS-12 | Header fields | **Doc Date, Ref.** only; no vendor/account/currency (THB). | Add a Location filter field in the header | H, I |
| Q-MS-13 | Print | **Enabled** for saved documents (browser print of the view); Excel disabled. | Disabled as Load | H-02 |
| Q-MS-14 | Lifecycle "Cancelled" | Use the existing statuses (ADR-0050): Draft, Pending, Revise, Approved, Rejected + soft Delete (ADR-0045). Delete of an Approved document reverses it until a new stock is used. No separate "Cancelled". | Add a CANCELLED status | lifecycle, BE-MS |
| Q-MS-15 | Can a stock be on two Merge/Split drafts? | Drafts hold nothing (Load Q-LS-06); a stock on a **Pending** Merge/Split is hidden from other pickers; the server re-checks at apply. | Hold on Draft | P-01, BE-MS |
| Q-MS-16 | **Can a merged stock be split later (and vice versa)?** | **Yes.** A result is an ordinary own stock and can enter a later Merge/Split document (once its creating document is Approved). Load's "A merged row can't be split later" applies within one document only. | Block re-conversion of merge/split results | P-01, BE-MS |
