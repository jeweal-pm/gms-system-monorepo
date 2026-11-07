# Design system: approve-center revision 1

- UI revision: 1 (approved 2026-11-07)
- Code tokens: `frontend/src/app/globals.css` (`@theme`, `--color-gms-*`, `--text-gms-*`, `--radius-gms-*`)
- Sources: [source/01-approve-quotation-empty.png](source/01-approve-quotation-empty.png), [source/02-approve-reserve-pending.png](source/02-approve-reserve-pending.png), 3840×2160 at 2× (all px below are CSS px at 1920×1080).

**M** = measured by pixel sampling (device px ÷ 2). **E** = estimated by eye. **C** = existing code token.

## Colors

| Use | Value | Evidence | Token |
|---|---|---|---|
| Primary (Approve button, doc link) | `#006A70` | M | `gms-primary` (C) |
| Text | `#1C252E` | M | `gms-text` (C) |
| Secondary text (dates, sub line) | `#656B71` | M | `gms-text-secondary` (C) |
| Placeholder / empty icon | `#ADB1B4` | E | `gms-text-placeholder` (C) |
| Page / table header background | `#F9F9F9` | M | `gms-page` (C) |
| Card / topbar | `#FFFFFF` | M | `gms-surface` (C) |
| Sidebar and Approve panel | `#FCFCFC` | M | `gms-surface-muted` (C) |
| Active nav item | `#F3F3F3` | M | `gms-nav-active` (C) |
| Borders, dividers, search border | `#EDEDED` | M | `gms-border` (C) |
| Reject outline / text, info icon | `#DF1016` | M | `gms-danger` (C) |
| Revise outline / text, Pending text (design) | `#FFAB00` | M | **new** `gms-revise` (proposed; no existing token has this value) |
| Pending badge background | `#FFE7B8` | M | `gms-warning-subtle` (C) |
| Pending badge text (recommended) | `#9A5B00` | C | `gms-warning-text` — Q-AP-12: `#FFAB00` on `#FFE7B8` ≈ 1.6:1 fails WCAG AA |
| Disabled button bg / text | `#F8F8F8` / `#A9A9A9` | M | `gms-field-disabled` / `gms-checkbox-readonly` (C) |
| Count badge bg / text | `#E2F0F0` / `#1C7B80` | M | **new** `gms-count-badge` / `gms-count-badge-text` (proposed) |

`#FFAB00` on white for the Revise label is ≈ 2.0:1, also below AA for 14 px text. Default: keep the outline color `#FFAB00` and use `gms-warning-text` `#9A5B00` for the label (Q-AP-12). Colors never carry meaning alone: Pending has its text; disabled buttons have the info icon and a tooltip.

## Typography (E; matches the existing scale)

| Use | Token | Weight |
|---|---|---|
| Page title | `gms-title` 24/32 | 600 |
| Panel title "Approve", empty-state title | `gms-heading` 16/24 | 600 |
| Table header | `gms-body` 14/20 | 600 |
| Cells, menu labels, buttons | `gms-body` 14/20 | 400 (buttons 500) |
| Doc date, sub line, submitted time, badge text | `gms-label` 12/16 | 400 |

Numbers use `tabular-nums`. Font: IBM Plex Sans Thai (existing `--font-sans`).

## Sizes and spacing

| Element | Value | Evidence |
|---|---|---|
| Main sidebar / Approve panel width | 236 px each | M (`spacing-gms-sidebar`) |
| Topbar height | 48 px | M (`spacing-gms-topbar`) |
| Panel item | 220 × 36 px, 8 px side inset, radius 8 px | M size, E radius |
| Panel count badge | 20 × 20 px circle | M |
| Sidebar total badge | 26 × 20 px pill | M |
| Content left padding | 24 px | M |
| Card border / radius / padding | 1 px / 12 px / 16 px | M / E / M |
| Search field | 360 × 36 px, radius 8 px | M / E |
| Table header row | ~55 px, 2 px bottom border | M |
| Body row | 56 px, 1 px divider | M |
| Action buttons | ~95 × 36 px, radius 8 px, ~9 px gap | M / E / M |
| Pending badge | ~60 × 24 px, radius 4 px | M / E |
| Info icon on disabled button | 14 px circle-i, offset to top-right | E |

## Components (names used by the UI spec)

- **Button primary** (Approve), **Button danger-outline** (Reject…), **Button warning-outline** (Revise…; new variant), **Button disabled-with-info** (state of any of them). Hover: darken 1 step (`gms-primary-strong` for primary; `gms-danger-subtle` fill for danger-outline; E). Focus: the existing 2 px focus ring.
- **Badge count**, **Badge off**, **Status badge Pending**.
- **Empty state** (tray icon + title + text).
- Reuse: `checkbox.tsx`, `sort-icon.tsx`, `confirm-dialog.tsx`, `toast.tsx`, `button.tsx`.

## Changes to tokens

Proposed new tokens (added with FE-AP-001 and this file in the same change): `--color-gms-revise: #ffab00`, `--color-gms-count-badge: #e2f0f0`, `--color-gms-count-badge-text: #1c7b80`. No other token changes.
