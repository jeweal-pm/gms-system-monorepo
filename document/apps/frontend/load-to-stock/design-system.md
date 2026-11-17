# Design system notes: load-to-stock

- UI revision: 1 (draft). Shared tokens: [purchase/design-system](../purchase/design-system.md). Values below are **E** (pixels sampled with `sharp` from `source/0x`, not Figma measurements) unless marked C.

| Token / use | Sampled value | Existing implementation (C) | Decision |
|---|---|---|---|
| Primary (Save, radio, "Create N load rows") | `#006A70` (03, 02) | `Button` primary `#0E5E63` | Keep existing (DV-09) |
| Primary disabled (Edit) | `#94C0C3` | `Button` disabled | Keep existing |
| Dark tool button "From Purchase" | `#1C252E` | `variant="dark"` | Reuse |
| Stock ID / lot badge | `#FFD88A` | existing lot/Stock ID badge on pickers | Reuse |
| Remove ⊖ | `#E74C50` | `CircleMinus` red in `ItemTable` | Reuse |
| Split trash | `#EB8487` (anti-aliased) | `Trash2` red | Reuse |
| Page background, photo box, group row fill | `#F9F9F9` | `bg-[#F9F9F9]` | Reuse |
| Section divider | `#EDEDED` ≈3 px | shared divider | Reuse |
| OK disabled (picker) | `#E4E4E4` | `Button` disabled | Reuse |
| "Select location" link text | `#808D99` | muted text | Reuse muted-foreground |
| Selected radio card | teal tint border/fill (≈`#A9CED0` border) | none for radio cards | New local style from existing teal tokens; no new token |

Typography: font family cannot be established from a screenshot; keep the app font (C). Bold first lines + 11–12 px grey sub-lines as on Purchase tables (E). Radii ≈6–8 px on cards/buttons, dialog ≈8 px (E). No shadows beyond the existing modal shadow (C).
