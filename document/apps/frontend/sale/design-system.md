# Design system notes: sale

- UI revision: 1 (pending-review)
- Token source: `frontend/src/app/globals.css` (C)

**No design image was supplied**, so there are no measured or pixel-estimated values and no new tokens. The page uses the existing tokens and components exactly as the shipped transaction pages do:

| Element | Component / token (C) | Same as |
|---|---|---|
| Primary Save | `Button` primary (`#0E5E63`) | every transaction page |
| From Reserve / From Stock | `Button variant="dark" size="sm"` (`#1C252E`) | Purchase Memo Stock / Purchase Order |
| Header fields | `QuotationInfoForm` grid, `FormSelect`, `FormDateInput`, read-only `TextInput` | Reserve |
| Divider | `border-[#E3E6EA]` `<hr>` | all |
| Table, Totals, photo box | `ItemTable`, `ItemPhotoBox` (`#F9F9F9` header / totals) | Reserve |
| Status badges | `FLOW_STATUS_LABELS` (Draft, Pending Approval, Revise, Approved, Rejected) | ADR-0050 pages |
| Picker dialogs | Purchase picker shell (1632 × 1000 max), `MemoStockModal` | Purchase, Reserve |
| Text styles | `text-gms-body`, `text-gms-text-secondary` | all |

The source line under the Stock ID ("from {Reserve No.}") uses the existing secondary small text style of the Purchase PO row ("from {PO No.}", C). If a Sale design arrives later, record its measurements here as UI revision 2.
