# Design system: stone-master (UI revision 1)

No new tokens. Everything maps to existing tokens and components; values are pixel estimates at DPR 2.

| Element | Value (estimate) | Token / component (existing) |
|---|---|---|
| Page title | 24 px, medium | `text-gms-title` |
| List label ("Stone Group List 3") | 14 px secondary | `text-gms-body text-gms-text-secondary` |
| Card title | 16 px, medium | `text-gms-heading` |
| Labels / helper text | 12 px | `text-gms-label`; helper `text-gms-text-secondary` |
| Fields | 404 px wide (Stone Code field 530 px), 54 px tall, notch label | `TextField` / `SelectField` (`components/ui/outlined-field.tsx`, `select-field.tsx`) |
| Read-only field (Auto code) | grey fill | `readOnlyControlClass`, `bg-gms-field-disabled` |
| Card | white, 1 px border, radius 12, fills the height | `Card` (`components/ui/card.tsx`) |
| Active switch | in the card header, right | `Switch` |
| Buttons | 38 px tall; Create outline, Save/Edit primary, Delete danger | `Button`, `IconButton` (partner header) |
| Drawer | 320 px, rows with a dot and "Inactive"/"Draft" badges | `PartnerDrawer` (generalized, see [conventions](conventions.md)), `Badge`, `CountBadge` |
| Radios (Manual/Auto) | 20 px circle, primary when selected | new small `RadioGroup` in `components/ui/` (native `input type="radio"`) |
| Multi-select chips | gray chip with ×, list with a check | existing `features/user-permission/components/ui/multi-select.tsx`, moved to `components/ui/` |
| Drag handle | 6-dot grip, 20 px, secondary color | lucide `GripVertical` |
