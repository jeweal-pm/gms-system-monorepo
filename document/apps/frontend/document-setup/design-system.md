# Design notes: document-setup

- UI revision: 1 (pending-review)
- No GMS design exists for this page; the reference image is another program. Use the existing tokens in [globals.css](../../../../frontend/src/app/globals.css) and the Stone Master / Vendor page styles. No new token is proposed.

| Element | Reuse |
|---|---|
| Page background, cards, borders, radii | `bg-gms-page`, `Card` (`rounded-gms-lg`, `border-gms-border`, header 58 px, body `p-6`) |
| Fields | `TextField` (outlined, label on the border, required `*` in `text-gms-danger`) |
| Declaration | `textarea` with the `TextField` box classes (`fieldBoxClass`) and the same label |
| Table | header row `bg-gms-page`, 42 px, uppercase-free labels; body rows 50 px, `border-b border-gms-border`; numbers right-aligned with tabular figures |
| "In use" / "Upcoming" badges | `Badge` variants default / draft (existing) |
| Drawer rows | `PartnerDrawer` row: title `text-gms-body font-medium`, subtitle `text-gms-label text-gms-text-secondary`; "Not set up" uses `text-gms-text-placeholder` |
| Icons | lucide `Plus` (Add row), `Trash2` (remove), existing Setup tile icon `DocumentSetupIcon` |
| Toast | existing dark toast, top right |
