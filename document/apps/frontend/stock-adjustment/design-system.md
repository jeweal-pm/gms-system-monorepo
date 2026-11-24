# Design system: stock-adjustment (UI revision 1, approved 2026-11-24)

Use existing tokens and components only. Measured from [source images](source/):

| Element | Token / value |
|---|---|
| Group header Stock | teal tint (same as Stock Card IN/OUT group headers); sub-header lighter teal; body cells light teal |
| Group header Physical | pink/red tint; body cells light pink; inputs white, rounded, right-aligned |
| Group header Diff | light blue tint; body cells very light blue; values right-aligned, "–" when empty |
| REMARK | neutral grey header; white rounded input |
| Row hover | light grey background |
| Row selected | light teal background (`--primary` at low opacity) |
| From Stock button | dark/primary-inverse button (same as Sale "From Stock") |
| Remove row | red ⊖ outline icon (as Load to Stock rows) |
| Stone Code cell | 3 lines: bold code · muted `lot · ref` · muted 💬 attributes |

Fonts, spacing, card radius and header button sizes come from the Load to Stock page. Dark mode uses the same token set.
